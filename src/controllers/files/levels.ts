import axios from 'axios'
import {BadRequestError, ForbiddenError, InternalServerError} from 'routing-controllers'
import { getManager } from 'typeorm'
import {resolve as resolveURL} from 'url'
import conf from '../../conf'
import File from '../../models/file'
import {Chart, ILevelBundle, Level } from '../../models/level'
import {IUser} from '../../models/user'
import {IFileUploadHandler, IFileUploadSessionData} from './index'

const db = getManager()

const LevelUploadHandler: IFileUploadHandler =  {
  uploadLinkTTL: 3600,
  targetPath: 'levels/packages',
  contentType: 'application/zip',
  async callback(user: IUser, session: IFileUploadSessionData) {
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
    level.description = ''
    level.published = false
    level.tags = []

    if (!packageMeta.id) {
      throw new BadRequestError("The 'id' field is required in level.json")
    }
    level.uid = packageMeta.id
    level.version = packageMeta.version || 1
    level.title = packageMeta.title || ''
    level.ownerId = user.id
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
      return entity
    })

    return db.transaction(async (tr) => {
      await tr.save(level.bundle)
      await tr.save(level)
        .catch((error) => {
          if (error.constraint === 'LEVEL_UID_UNIQUE') {
            throw new ForbiddenError('Level UID already exists.')
          }
          throw error
        })
      await tr.save(charts)
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
