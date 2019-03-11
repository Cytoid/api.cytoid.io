import axios from 'axios'
import {randomBytes} from 'crypto'
import {
  Authorized,
  BadRequestError,
  BodyParam,
  CurrentUser,
  ForbiddenError,
  Get,
  InternalServerError,
  JsonController, NotFoundError, Param, Post, Put, UseBefore,
  ContentType
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import BaseController from './base'

import {resolve as resolveURL} from 'url'
import {OptionalAuthenticate} from '../authentication'
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
    redisPrefix: 'cytoid:level:create:',
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

  private levelRatingCacheKey = 'cytoid:level:ratings:'
  @Get('/:id/ratings')
  @UseBefore(OptionalAuthenticate)
  @ContentType('application/json')
  public async getRatings(@Param('id') id: string, @CurrentUser() user: User) {
    const cacheVal = await redis.getAsync(this.levelRatingCacheKey + id)
    if (cacheVal) {
      if (user) {
        const result = JSON.parse(cacheVal)
        result.rating = await this.db.createQueryBuilder()
          .select('rating')
          .from('level_ratings', 'ratings')
          .where('"userId" = :userId', {userId: user.id})
          .andWhere('"levelId" = (SELECT id FROM levels WHERE uid = :levelId)', {levelId: id})
          .getRawOne()
          .then(a => a.rating)
        return result
      } else {
        return cacheVal
      }
    }
    // language=PostgreSQL
    return this.db.query(
`
WITH ratings AS (SELECT rating, "userId"
                 FROM level_ratings
                 WHERE "levelId" = (SELECT id FROM levels WHERE uid = $1))
SELECT round(avg(rating)) AS average,
       count(*)           AS total,
       ${user ? '(SELECT rating from ratings where "userId" = $2),' : ''}
       array(SELECT coalesce(data.count, 0) AS rating
             FROM (SELECT generate_series(1, 10) items) fullrange
             LEFT OUTER JOIN (SELECT ratings.rating, count(ratings.rating)
                              FROM ratings
                              GROUP BY ratings.rating) data ON data.rating = fullrange.items) AS distribution
FROM ratings`,
      user ? [id, user.id] : [id])
      .then(async (a) => {
        a = a[0]
        a.average = parseInt(a.average, 10)
        a.total = parseInt(a.total, 10)
        a.distribution = a.distribution.map((i: string) => parseInt(i, 10))
        const rating = parseInt(a.rating, 10)
        delete a.rating
        await redis.setexAsync(this.levelRatingCacheKey + id, 3600, JSON.stringify(a))
        if (rating) a.rating = rating
        return a
      })
  }

  @Post('/:id/ratings')
  @Authorized()
  public async updateRatings(
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
      .then(async (a) => {
        console.log(a)
        await redis.delAsync(this.levelRatingCacheKey + id)
      })
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
    await redis.setexAsync(this.createPackageConfig.redisPrefix + key, ttl, JSON.stringify(sessionData))
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
