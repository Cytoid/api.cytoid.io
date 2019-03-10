import {
  Get,
  Put,
  JsonController,
  Post,
  Param,
  BodyParam,
  NotFoundError,
  InternalServerError,
  BadRequestError, ForbiddenError
} from 'routing-controllers'
import BaseController from './base'
import {randomBytes} from 'crypto'
import axios from 'axios'
import {getRepository} from 'typeorm'

import Storage from '../storage'
import {Level, Rating, Chart, LevelMeta, ILevelBundle} from '../models/level'
import File from '../models/file'
import {redis} from '../db'
import { resolve as resolveURL } from 'url'
import conf from '../conf'


@JsonController('/levels')
export default class LevelController extends BaseController {
  private fileRepo = getRepository(File)
  private levelRepo = getRepository(Level)

  @Get('/:id')
  getLevel(@Param('id') id: string) {
    return this.levelRepo.find({  // Use 'find' instead of 'findOne' to avoid duplicated queries
      where: {uid: id},
      relations: ['package', 'directory']
    })
      .then(charts => charts[0]) // uid is unique, so it's guaranteed to return at most 1 item here.
      .then(chart => {
        console.log(chart)
        return chart
      })
  }

  createPackageConfig = {
    packageLen: 30,
    redisPrefix: 'cytoid:levelcreate:',
    unpkgURL: 'http://localhost:5000/resolve-level-files',
    packagePath: 'levels/packages/',
    bundlePath: 'levels/bundles/'
  }

  @Post('/packages')
  async createPackage(@BodyParam('key') key: string) {
    if (!key) return this.signPackageUploadURL()
    else return this.unpackPackage(key)
  }

  async signPackageUploadURL() {
    const ttl = 600
    const packageName = (await randomBytes(this.createPackageConfig.packageLen))
      .toString('base64')
      .replace(/\W/g, '')
    const path = this.createPackageConfig.packagePath + packageName
    const file = new File(path)
    // TODO: mark the file owner
    const key = (await randomBytes(15)).toString('base64')

    await this.db.save(file, {transaction: false})
    const sessionData: LevelCreateSessionData = {
      pkgName: packageName,
      id: file.id,
      // userId:
    }
    redis.setex(this.createPackageConfig.redisPrefix + key, ttl, JSON.stringify(sessionData))
    return {
      uploadURL: await Storage.getUploadURL(path, 'application/zip', ttl),
      key: key
    }
  }

  async unpackPackage(key: string) {
    const sessionData: LevelCreateSessionData = JSON.parse(
      await redis.getAsync(this.createPackageConfig.redisPrefix + key))
    if (!sessionData) {
      throw new NotFoundError('Access Key not exist or expired')
    }
    const packagePath = this.createPackageConfig.packagePath + sessionData.pkgName
    const bundlePath = this.createPackageConfig.bundlePath + sessionData.pkgName
    const leveldata = await axios.post(this.createPackageConfig.unpkgURL, {
      packagePath: packagePath,
      bundlePath: bundlePath,
    }, {headers: {'content-type': 'application/json'}})
      .then(res => res.data)
      .catch(error => {
        if (error.response && error.response.data) {
          throw new BadRequestError(error.response.data.message || 'Unknown Error')
        }
        throw new InternalServerError('Errors in package analytics services')
      })
    const packageMeta: PackageMeta.IMeta = leveldata.metadata

    // Convert packageMeta into database models
    const level = new Level()

    if (!packageMeta.id) throw new BadRequestError("The 'id' field is required in level.json")
    level.uid = packageMeta.id
    level.version = packageMeta.version || 1
    level.title = packageMeta.title || ''
    // TODO: level.owner
    level.metadata = {
      title: packageMeta.title,
      title_localized: packageMeta.title_localized,
    }

    // TODO: Optimizations
    if (packageMeta.artist) level.metadata.artist = {
      name: packageMeta.artist,
      url: packageMeta.artist_source,
      localized_name: packageMeta.artist_localized
    }
    if (packageMeta.illustrator) level.metadata.illustrator = {
      name: packageMeta.illustrator,
      url: packageMeta.illustrator_source,
    }
    if (packageMeta.charter) level.metadata.charter = {
      name: packageMeta.charter,
    }
    if (packageMeta.storyboarder) level.metadata.storyboarder = {
      name: packageMeta.storyboarder,
    }

    level.bundle = new File(bundlePath) as ILevelBundle
    level.bundle.content = {
      music: packageMeta.music && packageMeta.music.path,
      music_preview: packageMeta.music_preview && packageMeta.music_preview.path,
      background: packageMeta.background && packageMeta.background.path
    }
    level.packageId = sessionData.id

    const charts = packageMeta.charts.map(chart => {
      const entity = new Chart()
      entity.difficulty = chart.difficulty
      entity.type = chart.type
      entity.name = chart.name
      entity.level = level
      // TODO: Add keys to levelBundle.content.charts
      return entity
    })

    return this.db.transaction(async tr => {
      const qb = tr.createQueryBuilder()
      await qb.update(File)
        .set({created: true})
        .where("id = :id", {id: sessionData.id})
        .execute()
      await tr.save(level.bundle)
      await tr.save(level)
        .catch(error => {
          if (error.constraint == 'LEVEL_UID_UNIQUE') {
            throw new ForbiddenError('Level UID already exists.')
          }
          throw error
        })
      await Promise.all(charts.map(chart => tr.save(chart)))
      return level
    })
      .then((level: any) => {
        level.package = resolveURL(conf.assetsURL, packagePath)
        level.bundle = level.bundle.toPlain()
        return level
      })
  }
}

interface LevelCreateSessionData {
  pkgName: string
  id: number
  userId?: string
}

namespace PackageMeta {
  export interface IChart extends IResource {
    type: string
    name?: string
    difficulty: number
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
