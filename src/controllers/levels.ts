import axios from 'axios'
import {randomBytes} from 'crypto'
import {
  Authorized,
  BadRequestError,
  Body,
  BodyParam,
  CurrentUser,
  ForbiddenError,
  Get,
  InternalServerError,
  JsonController, NotFoundError, Param, Post, Put,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import BaseController from './base'

import {resolve as resolveURL} from 'url'
import conf from '../conf'
import {redis} from '../db'
import File from '../models/file'
import {Chart, ILevelBundle, Level, LevelMeta, Rating} from '../models/level'
import User from '../models/user'
import Storage from '../storage'

@JsonController('/levels')
export default class LevelController extends BaseController {

  public createPackageConfig = {
    packageLen: 30,
    redisPrefix: 'cytoid:levelcreate:',
    unpkgURL: 'http://localhost:5000/resolve-level-files',
    packagePath: 'levels/packages/',
    bundlePath: 'levels/bundles/',
  }
  private levelRepo = getRepository(Level)

  @Get('/:id')
  public getLevel(@Param('id') id: string) {
    return this.levelRepo.find({  // Use 'find' instead of 'findOne' to avoid duplicated queries
      where: {uid: id},
      relations: ['package', 'directory'],
    })
      .then((charts) => charts[0]) // uid is unique, so it's guaranteed to return at most 1 item here.
  }

  @Get('/:id/ratings')
  @Authorized()
  public getRatings(@Param('id') id: string, @CurrentUser() user: User) {
    return this.db.query(`
      WITH ratings AS (SELECT ratings.rating, ratings."userId"
                       FROM level_ratings AS ratings
                              INNER JOIN levels ON levels.id = ratings."levelId"
                       WHERE levels.uid = $1)
      SELECT round(avg(rating)) AS average,
             count(*)           as total,
             ${user ? '(SELECT rating from ratings where "userId" = $2),' : ''}
             array(select coalesce(data.count, 0) as rating
                   from (select unnest(array [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) items) therange
                   LEFT OUTER JOIN (SELECT ratings.rating, COUNT(ratings.rating)
                                    FROM ratings
                                    GROUP BY ratings.rating) data ON data.rating = therange.items) as distribution
      FROM ratings`,
      [id, user.id])
      .then((a) => {
        a = a[0]
        a.average = parseInt(a.average1, 10)
        a.total = parseInt(a.total, 10)
        a.rating = parseInt(a.rating, 10)
        a.distribution = a.distribution.map((i: string) => parseInt(i, 10))
        return a
      })
  }

  @Post('/:id/ratings')
  @Authorized()
  public async create(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @BodyParam('rating', {required: true}) rating: number) {
    if (!rating || rating >= 10 || rating < 0) {
      throw new BadRequestError('Rating missing or out of range (0 - 10)')
    }
    const qb = this.db.createQueryBuilder()
    const levelIdQuery = qb.subQuery()
      .createQueryBuilder()
      .select('id')
      .from(Level, 'level')
      .where('level.uid = :uid', {uid: id})
    await qb
      .insert()
      .into(Rating)
      .values({
        levelId: () => `(${levelIdQuery.getQuery()})`,
        userId: user.id,
        rating,
      })
      .onConflict('ON CONSTRAINT "LEVEL_RATING_UNIQUE" DO UPDATE SET "rating" = :rating')
      .setParameter('rating', rating)
      .setParameters(levelIdQuery.getParameters())
      .execute()
      .catch((error) => {
        if (error.column === 'levelId'
        && error.table === 'level_ratings'
        && error.code === '23502') {
          throw new BadRequestError('The specified level does not exist!')
        }
        throw error
      })
    return 'success'
  }

  @Post('/packages')
  public async createPackage(@BodyParam('key') key: string) {
    if (!key) { return this.signPackageUploadURL() } else { return this.unpackPackage(key) }
  }

  public async signPackageUploadURL() {
    const ttl = 600
    const packageName = (await randomBytes(this.createPackageConfig.packageLen))
      .toString('base64')
      .replace(/\W/g, '')
    const path = this.createPackageConfig.packagePath + packageName
    const file = new File(path)
    // TODO: mark the file owner
    const key = (await randomBytes(15)).toString('base64')

    await this.db.save(file, {transaction: false})
    const sessionData: ILevelCreateSessionData = {
      pkgName: packageName,
      id: file.id,
      // userId:
    }
    redis.setex(this.createPackageConfig.redisPrefix + key, ttl, JSON.stringify(sessionData))
    return {
      uploadURL: await Storage.getUploadURL(path, 'application/zip', ttl),
      key,
    }
  }

  public async unpackPackage(key: string) {
    const sessionData: ILevelCreateSessionData = JSON.parse(
      await redis.getAsync(this.createPackageConfig.redisPrefix + key))
    if (!sessionData) {
      throw new NotFoundError('Access Key not exist or expired')
    }
    const packagePath = this.createPackageConfig.packagePath + sessionData.pkgName
    const bundlePath = this.createPackageConfig.bundlePath + sessionData.pkgName
    const leveldata = await axios.post(this.createPackageConfig.unpkgURL, {
      packagePath,
      bundlePath,
    }, {headers: {'content-type': 'application/json'}})
      .then((res) => res.data)
      .catch((error) => {
        if (error.response && error.response.data) {
          throw new BadRequestError(error.response.data.message || 'Unknown Error')
        }
        throw new InternalServerError('Errors in package analytics services')
      })
    const packageMeta: PackageMeta.IMeta = leveldata.metadata

    // Convert packageMeta into database models
    const level = new Level()

    if (!packageMeta.id) { throw new BadRequestError("The 'id' field is required in level.json") }
    level.uid = packageMeta.id
    level.version = packageMeta.version || 1
    level.title = packageMeta.title || ''
    // TODO: level.owner
    level.metadata = {
      title: packageMeta.title,
      title_localized: packageMeta.title_localized,
    }

    // TODO: Optimizations
    if (packageMeta.artist) { level.metadata.artist = {
      name: packageMeta.artist,
      url: packageMeta.artist_source,
      localized_name: packageMeta.artist_localized,
    }
    }
    if (packageMeta.illustrator) { level.metadata.illustrator = {
      name: packageMeta.illustrator,
      url: packageMeta.illustrator_source,
    }
    }
    if (packageMeta.charter) { level.metadata.charter = {
      name: packageMeta.charter,
    }
    }
    if (packageMeta.storyboarder) { level.metadata.storyboarder = {
      name: packageMeta.storyboarder,
    }
    }

    level.bundle = new File(bundlePath) as ILevelBundle
    level.bundle.content = {
      music: packageMeta.music && packageMeta.music.path,
      music_preview: packageMeta.music_preview && packageMeta.music_preview.path,
      background: packageMeta.background && packageMeta.background.path,
    }
    level.packageId = sessionData.id

    const charts = packageMeta.charts.map((chart) => {
      const entity = new Chart()
      entity.difficulty = chart.difficulty
      entity.type = chart.type
      entity.name = chart.name
      entity.level = level
      // TODO: Add keys to levelBundle.content.charts
      return entity
    })

    return this.db.transaction(async (tr) => {
      const qb = tr.createQueryBuilder()
      await qb.update(File)
        .set({created: true})
        .where('id = :id', {id: sessionData.id})
        .execute()
      await tr.save(level.bundle)
      await tr.save(level)
        .catch((error) => {
          if (error.constraint === 'LEVEL_UID_UNIQUE') {
            throw new ForbiddenError('Level UID already exists.')
          }
          throw error
        })
      await Promise.all(charts.map((chart) => tr.save(chart)))
      return level
    })
      .then((result: any) => {
        result.package = resolveURL(conf.assetsURL, packagePath)
        result.bundle = result.bundle.toPlain()
        return result
      })
  }
}

interface ILevelCreateSessionData {
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
