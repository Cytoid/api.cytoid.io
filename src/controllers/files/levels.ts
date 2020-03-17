import axios from 'axios'
import {BadRequestError, ForbiddenError, InternalServerError} from 'routing-controllers'
import { getManager } from 'typeorm'
import {resolve as resolveURL} from 'url'
import ac from '../../access'
import conf from '../../conf'
import eventEmitter from '../../events'
import File from '../../models/file'
import {Chart, ILevelBundle, Level } from '../../models/level'
import {IUser} from '../../models/user'
import {IFileUploadHandler, IFileUploadSessionData} from './index'

const db = getManager()

const LevelUploadHandler: IFileUploadHandler =  {
  uploadLinkTTL: 3600,
  targetPath: 'levels/packages',
  contentType: 'application/zip',
  async callback(user: IUser, session: IFileUploadSessionData, info: any) {
    const packagePath = session.path
    const bundlePath = 'levels/bundles/' + session.name
    const leveldata = await axios.post(conf.functionURL + '/resolve-level-files', {
      packagePath,
      bundlePath,
    }, {headers: {'content-type': 'application/json'}})
      .then((res) => res.data)
      .catch((error) => {
        if (error.response && error.response.data) {
          console.log(error.response.data)
          throw new BadRequestError(error.response.data.message || 'Unknown Error')
        }
        console.error(error)
        throw new InternalServerError('Errors in package analytics services')
      })
    const packageMeta: PackageMeta.IMeta = leveldata.metadata

    // Convert packageMeta into database models
    const level = new Level()

    if (!packageMeta.id) {
      throw new BadRequestError("The 'id' field is required in level.json")
    }

    if (info.replaceUID) {
      if (info.replaceUID !== packageMeta.id) {
        throw new BadRequestError(`Uploaded package ${packageMeta.id} but requires ${info.replaceUID}`)
      }
      const oldLevel = await db.findOne(Level,{
        select: ['ownerId', 'version'],
        where: { uid: info.replaceUID },
      })
      const access = ac.can(user.role)
      const granted = (
        oldLevel.ownerId === user.id ?
          access.updateOwn('level') :
          access.updateAny('level')
      ).granted
      if (!granted) {
        throw new ForbiddenError("You don't have the permission to replace this level")
      }
      if (oldLevel.version > packageMeta.version) {
        throw new BadRequestError(`The new level (version ${packageMeta.version}) is older than the current level (version ${oldLevel.version})`)
      }
    }
    level.uid = packageMeta.id
    level.version = packageMeta.version
    level.title = packageMeta.title
    level.metadata = {
      title: packageMeta.title,
      title_localized: packageMeta.title_localized,
      raw: packageMeta,
    }
    level.duration = leveldata.duration
    level.size = leveldata.size

    // TODO: Optimizations
    if (packageMeta.artist) {
      level.metadata.artist = {
        name: packageMeta.artist,
        url: packageMeta.artist_source,
        localized_name: packageMeta.artist_localized,
      }
    }
    if (packageMeta.illustrator) {
      level.metadata.illustrator = {
        name: packageMeta.illustrator,
        url: packageMeta.illustrator_source,
      }
    }
    if (packageMeta.charter) {
      level.metadata.charter = {
        name: packageMeta.charter,
      }
    }
    if (packageMeta.storyboarder) {
      level.metadata.storyboarder = {
        name: packageMeta.storyboarder,
      }
    }

    level.bundle = new File(bundlePath, 'bundle') as ILevelBundle
    level.bundle.ownerId = user.id
    level.bundle.content = {
      music: packageMeta.music && packageMeta.music.path,
      music_preview: packageMeta.music_preview && packageMeta.music_preview.path,
      background: packageMeta.background && packageMeta.background.path,
    }
    level.packagePath = session.path

    const charts = packageMeta.charts.map((chart) => {
      const entity = new Chart()
      entity.difficulty = chart.difficulty
      entity.type = chart.type
      entity.name = chart.name
      entity.level = level
      entity.notesCount = chart.notesCount
      entity.checksum = chart.checksum
      entity.hash = Buffer.from(chart.hash, 'hex')
      return entity
    })

    return db.transaction(async (tr) => {
      await tr.insert(File, level.bundle)
      if (info.replaceUID) {
        level.id = await tr
          .createQueryBuilder(Level, 'l')
          .update()
          .set(level)
          .where({ uid: level.uid })
          .returning('id')
          .execute()
          .then((res) => res.raw[0].id)
        await tr.createQueryBuilder(Chart, 'c')
          .insert()
          .values(charts)
          .onConflict('("levelId", "type") DO UPDATE SET ' +
            'difficulty=EXCLUDED.difficulty,' +
            'hash=EXCLUDED.hash,' +
            'name=EXCLUDED.name,' +
            '"notesCount"=EXCLUDED."notesCount",' +
            'checksum=EXCLUDED.checksum')
          .execute()
        await tr.createQueryBuilder()
          .delete()
          .from(Chart)
          .where({ levelId: level.id })
          .andWhere('type NOT IN (:...ids)', { ids: charts.map((c) => c.type)})
          .execute()
      } else {
        level.ownerId = user.id
        await tr.insert(Level, level)
          .catch((error) => {
            if (error.constraint === 'levels_uid_key') {
              throw new ForbiddenError(`Level ${level.uid} already exists.`)
            }
            throw error
          })
        await tr.insert(Chart, charts)
      }
      eventEmitter.emit('level_uploaded', level)
      return level
    })
      .then((result: any) => {
        result.package = resolveURL(conf.assetsURL, packagePath)
        result.bundle = result.bundle.toPlain()
        return result
      })
  },
}
export default LevelUploadHandler

namespace PackageMeta {
  export interface IChart extends IResource {
    type: string
    name?: string
    difficulty: number
    notesCount: number
    checksum: string
    hash: string
  }

  export interface IResource {
    path: string
  }

  export interface IMeta {
    version: number
    schema_version: number

    id: string
    title: string
    title_localized?: string

    artist: string
    artist_localized?: string
    artist_source?: string
    illustrator?: string
    illustrator_source?: string
    charter?: string
    storyboarder?: string

    music: IResource
    music_preview: IResource
    background: IResource
    charts: IChart[]
  }
}
