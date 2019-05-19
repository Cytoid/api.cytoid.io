import axios from 'axios'
import {randomBytes} from 'crypto'
import {
  Authorized,
  BadRequestError,
  BodyParam,
  QueryParam,
  CurrentUser,
  ForbiddenError,
  Get,
  Ctx,
  InternalServerError,
  JsonController, NotFoundError, Param, Post, UseBefore,
  ContentType, Body, HttpError,
} from 'routing-controllers'
import {
  IsBoolean,
  IsInt, IsNumber, Min, Max,
  IsInstance,
  ValidateNested,
  ArrayUnique,
} from 'class-validator'
import {Type} from 'class-transformer'
import {getRepository, In, SelectQueryBuilder} from 'typeorm'
import {Context} from 'koa'

import BaseController from './base'
import {resolve as resolveURL} from 'url'
import {OptionalAuthenticate} from '../authentication'
import conf from '../conf'
import {redis} from '../db'
import File from '../models/file'
import {Chart, ILevelBundle, Level, Rating} from '../models/level'
import { IUser } from '../models/user'
import Record, {RecordDetails} from '../models/record'
import Storage from '../storage'

class NewRecord {

  @IsInt()
  @Min(0)
  @Max(1000000)
  public score: number

  @IsNumber()
  @Min(0)
  @Max(1)
  public accuracy: number

  @Type(() => RecordDetails)
  @ValidateNested() // FIXME: 500 error "newValue_1.push is not a function" when post an array
  @IsInstance(RecordDetails)
  public details: RecordDetails

  @ArrayUnique() // TODO: check all mods are valid.
  public mods: string[]

  @IsBoolean()
  public ranked: boolean
}

@JsonController('/levels')
export default class LevelController extends BaseController {

  public createPackageConfig = {
    packageLen: 30,
    redisPrefix: 'cytoid:level:create:',
    unpkgURL: conf.functionURL + '/resolve-level-files',
    packagePath: 'levels/packages/',
    bundlePath: 'levels/bundles/',
  }
  private levelRepo = getRepository(Level)
  private chartRepo = getRepository(Chart)

  public levelsPerPage = 18

  @Get('/:id')
  @UseBefore(OptionalAuthenticate)
  public getLevel(@Param('id') id: string, @CurrentUser() user?: IUser) {
    return this.levelRepo.find({  // Use 'find' instead of 'findOne' to avoid duplicated queries
      where: {uid: id},
      relations: ['bundle', 'charts', 'owner'],
    }).then((levels) => {
        if (levels.length === 0) {
          return undefined
        }
        const level = levels[0]
        const result: any = level
        result.bundle = level.bundle.toPlain()
        result.package = result.packageId
        delete result.packagePath

        if (user && (user.id === level.ownerId)) {
          return result
        } // If the user was the owner, return the result without all the checks.

        if (level.censored !== null && level.censored !== 'ccp') {
          throw new HttpError(451, 'censored:' + level.censored)
        } // If the level was censored, return 451. On the global site ignore ccp censorship.

        if (!level.published) {
          throw new ForbiddenError('unpublished')
        }
        return result
      })
  }

  @Get('/')
  public async getLevels(
    @QueryParam('page') pageNum: number = 0,
    @QueryParam('limit') pageLimit: number = 30,
    @QueryParam('order') sortOrder: string = 'asc',
    @Ctx() ctx: Context) {
    if (pageLimit > 30) {
      pageLimit = 30
    }
    if (pageNum < 0 || !Number.isInteger(pageNum)) {
      throw new BadRequestError('Page has to be a positive integer!')
    }
    const keyMap: {[index: string]: string} = {
      creation_date: 'levels.date_created',
      modification_date: 'levels.date_modified',
      duration: 'levels.duration',
      downloads: 'levels.downloads',
      rating: 'rating',
      difficulty: (sortOrder === 'asc' ? 'max' : 'min') + '(charts.difficulty)',
    }
    let query = this.db.createQueryBuilder(Level, 'levels')
      .where("levels.published=true AND (levels.censored IS NULL OR levels.censored='ccp')")
      .leftJoin('levels.bundle', 'bundle', "bundle.type='bundle' AND bundle.created=true")
      .leftJoin('levels.owner', 'owner')
      .leftJoin('levels.charts', 'charts')
      .select([
        'levels.title',
        'levels.id',
        'bundle.content',
        'bundle.path',
        'owner.uid',
        'owner.email',
        'owner.name',
        'json_agg(charts ORDER BY charts.difficulty) as charts',
        '(SELECT avg(level_ratings.rating) FROM level_ratings WHERE level_ratings."levelId"=levels.id) as rating',
      ])
      .orderBy(keyMap[ctx.request.query.sort] || 'levels.date_created',
        (sortOrder.toLowerCase() === 'desc') ? 'DESC' : 'ASC')
      .groupBy('levels.id, bundle.path, owner.id')
      .limit(pageLimit)
      .offset(pageLimit * pageNum)
    let theChartsQb: SelectQueryBuilder<any> = null
    function chartsQb() {
      if (!theChartsQb) {
        theChartsQb = query.subQuery()
          .select('*')
          .from('charts', 'charts')
          .where('charts."levelId"=levels.id')
      }
      return theChartsQb
    }
    // Type filter. There exist a chart with designated type
    if (ctx.request.query.type && ['easy', 'hard', 'extreme'].includes(ctx.request.query.type)) {
      theChartsQb = chartsQb().andWhere('charts.type=:type', { type: ctx.request.query.type })
    }

    // Difficulty filter. There exist a chart satisfying the designated difficulty constraint
    if (ctx.request.query.difficulty) {
      const notation = ctx.request.query.difficulty
      const rangeRegex = /(\d+)..(\d+)/
      const thresholdRegex = /(\d+)([+-])/
      if (parseInt(notation, 10)) {
        theChartsQb = chartsQb().andWhere('charts.difficulty=:diff', {diff: parseInt(notation, 10)})
      } else if (thresholdRegex.test(notation)) {
        const [numstr, operator] = thresholdRegex.exec(notation)
        const num = parseInt(numstr, 10)
        if (operator === '+') {
          theChartsQb = chartsQb().andWhere('charts.difficulty>=:num', { num })
        } else if (operator === '-') {
          theChartsQb = chartsQb().andWhere('charts.difficulty<=:num', { num })
        }
      } else if (rangeRegex.test(notation)) {
        const [lowerStr, upperStr] = rangeRegex.exec(notation)
        const lower = parseInt(lowerStr, 10)
        const upper = parseInt(upperStr, 10)
        theChartsQb = chartsQb().andWhere('charts.difficulty BETWEEN :lower AND :upper', { lower, upper })
      }
    }
    if (theChartsQb) {
      query = query.andWhere(`EXISTS${theChartsQb.getQuery()}`, theChartsQb.getParameters())
    }
    if (ctx.request.query.featured === 'true') {
      query = query.andWhere("(levels.metadata->'featured')::boolean=true")
    }
    if (ctx.request.query.uploader) {
      query = query.andWhere('owner.uid=:uid', { uid: ctx.request.query.uploader })
    }
    return Promise.all([query.getRawAndEntities(), query.getCount()])
      .then(([{entities, raw}, count]) => {
        ctx.set('X-Total-Page', Math.floor(count / this.levelsPerPage).toString())
        ctx.set('X-Total-Entries', count.toString())
        ctx.set('X-Current-Page', pageNum.toString())
        return entities.map((level: any, index) => {
          const rawRecord = raw[index]
          level.bundle = level.bundle.toPlain()
          level.charts = rawRecord.charts
          level.rating = parseFloat(rawRecord.rating) || null
          return level
        })
      })
  }

  private levelRatingCacheKey = 'cytoid:level:ratings:'

  /**
   * Get the rating distribution, total count, and mean ratings for a level.
   * If the user was authenticated, also returns the rating the user gave.
   * @param id The UID of the level
   * @param user The user. Optional.
   */
  @Get('/:id/ratings')
  @UseBefore(OptionalAuthenticate)
  @ContentType('application/json')
  public async getRatings(@Param('id') id: string, @CurrentUser() user?: IUser) {
    const cacheVal = await redis.getAsync(this.levelRatingCacheKey + id)
    if (cacheVal) {
      if (user) {
        const rating = await this.db.createQueryBuilder()
          .select('rating')
          .from('level_ratings', 'ratings')
          .where('"userId" = :userId', {userId: user.id})
          .andWhere('"levelId" = (SELECT id FROM levels WHERE uid = :levelId)', {levelId: id})
          .getRawOne()
          .then((a) => {
            return a ? a.rating : null
          })
        const result = JSON.parse(cacheVal)
        result.rating = rating
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
        if (rating) { a.rating = rating }
        return a
      })
  }

  /**
   * Update the ratings for a level. Authentication Required.
   * @param id
   * @param user
   * @param rating
   */
  @Post('/:id/ratings')
  @Authorized()
  public async updateRatings(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @BodyParam('rating', {required: true}) rating: number) {
    if (!rating || rating > 10 || rating <= 0) {
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
    await redis.delAsync(this.levelRatingCacheKey + id)
    return this.getRatings(id, user)
  }

  /**
   * Routing based on if the request includes the package upload key.
   * @param key
   * @param user
   */
  @Post('/packages')
  @Authorized()
  public async createPackage(@BodyParam('key') key: string, @CurrentUser() user: IUser) {
    if (!key) { return this.signPackageUploadURL(user) } else { return this.unpackPackage(key, user) }
  }

  /**
   * Generate the package upload key, create the temporary file in the db,
   * and sign the upload URL from Google Cloud Storage.
   * @param user
   */
  public async signPackageUploadURL(user: IUser) {
    const ttl = 600
    const packageName = (await randomBytes(this.createPackageConfig.packageLen))
      .toString('base64')
      .replace(/\W/g, '')
    const path = this.createPackageConfig.packagePath + packageName
    const file = new File(path, 'package')
    file.ownerId = user.id
    const key = (await randomBytes(15)).toString('base64')

    await this.db.save(file, {transaction: false})
    const sessionData: ILevelCreateSessionData = {
      pkgName: packageName,
      path,
      userId: user.id,
    }
    await redis.setexAsync(this.createPackageConfig.redisPrefix + key, ttl, JSON.stringify(sessionData))
    return {
      uploadURL: await Storage.getUploadURL(path, 'application/zip', ttl),
      key,
    }
  }

  /**
   * Verify the upload key, unpackage and analyze the package, create the bundle directory,
   * extract the metadata from the package, save it into the database, and return the metadata.
   * @param key
   * @param user
   */
  public async unpackPackage(key: string, user: IUser) {
    const sessionData: ILevelCreateSessionData = JSON.parse(
      await redis.getAsync(this.createPackageConfig.redisPrefix + key))
    if (!sessionData) {
      throw new NotFoundError('Access Key not exist or expired')
    }
    if (sessionData.userId !== user.id) {
      throw new ForbiddenError('Must be logged in as the user who originally started the operation!')
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
        console.log(error)
        throw new InternalServerError('Errors in package analytics services')
      })
    console.log('func returned...')
    const packageMeta: PackageMeta.IMeta = leveldata.metadata

    // Convert packageMeta into database models
    const level = new Level()

    if (!packageMeta.id) { throw new BadRequestError("The 'id' field is required in level.json") }
    level.uid = packageMeta.id
    level.version = packageMeta.version || 1
    level.title = packageMeta.title || ''
    level.ownerId = user.id
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

    level.bundle = new File(bundlePath, 'bundle') as ILevelBundle
    level.bundle.ownerId = user.id
    level.bundle.created = true
    level.bundle.content = {
      music: packageMeta.music && packageMeta.music.path,
      music_preview: packageMeta.music_preview && packageMeta.music_preview.path,
      background: packageMeta.background && packageMeta.background.path,
    }
    level.packagePath = sessionData.path

    const charts = packageMeta.charts.map((chart) => {
      const entity = new Chart()
      entity.difficulty = chart.difficulty
      entity.type = chart.type
      entity.name = chart.name
      entity.level = level
      return entity
    })

    return this.db.transaction(async (tr) => {
      const qb = tr.createQueryBuilder()
      await qb.update(File)
        .set({created: true})
        .where('path = :path', {path: sessionData.path})
        .execute()
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
  }

  @Get('/:id/charts/:chartType/')
  public getChart(@Param('id') id: string, @Param('chartType') chartType: string) {
    return this.db.createQueryBuilder()
      .select('name')
      .addSelect('difficulty')
      .from(Chart, 'chart')
      .where('type = :chartType', {chartType})
      .andWhere('"levelId" = (SELECT id FROM levels WHERE uid = :levelId)', {levelId: id})
      .getRawOne()
      .then((a) => {
        a.level = id
        a.type = chartType
        return a
      })
  }

  private queryLeaderboard(chartId?: number) {
    return `
SELECT record.*,
       users.uid as "user/uid", users.name as "user/name",
       users.email as "user/email",
       rank() OVER (ORDER BY score DESC, date ASC)
FROM (SELECT DISTINCT ON ("ownerId") *
      FROM records
      WHERE "chartId" = ${
      chartId ?
        '$1' :
        '(SELECT id FROM charts WHERE "levelId" = (SELECT id FROM levels WHERE uid = $1) AND type = $2)'
      }
      ORDER BY "ownerId", score DESC, date ASC) record
LEFT JOIN users on users.id = record."ownerId"
`
  }
  private formatLeaderboardQueryResult(result: any) {
    result.owner = {
      uid: result['user/uid'],
      name: result['user/name'],
      email: result['user/email'],
      id: result.ownerId,
    }
    delete result['user/uid']
    delete result['user/name']
    delete result['user/email']
    delete result.ownerId
    result.rank = parseInt(result.rank, 10)
    return result
  }

  @Get('/:id/charts/:chartType/ranking')
  public getChartRanking(@Param('id') id: string, @Param('chartType') chartType: string) {
    return this.db.query(this.queryLeaderboard(), [id, chartType])
      .then((result) => result.map(this.formatLeaderboardQueryResult))

  }

  @Get('/:id/charts/:chartType/ranking/my')
  @Authorized()
  public getMyChartRanking(@Param('id') id: string, @Param('chartType') chartType: string, @CurrentUser() user: IUser) {
    return this.db.query(`
WITH leaderboard as (${this.queryLeaderboard()})
SELECT *
FROM leaderboard
WHERE abs(rank - (SELECT rank FROM leaderboard WHERE "ownerId" = $3)) < 2`,
      [id, chartType, user.id])
    .then((result) => result.map(this.formatLeaderboardQueryResult))
  }

  @Post('/:id/charts/:chartType/records')
  @Authorized()
  public addRecord(
    @Param('id') id: string,
    @Param('chartType') chartType: string,
    @CurrentUser() user: IUser,
    @Body() record: NewRecord) {
    const qb = this.db.createQueryBuilder()
    const chartQuery =
    qb.subQuery()
      .select('id')
      .from(Chart, 'chart')
      .where('type = :chartType', {chartType})
      .andWhere('"levelId" = (SELECT id FROM levels WHERE uid = :levelId)', {levelId: id})
    return  qb.insert()
      .into(Record)
      .values({
        ownerId: user.id,
        score: record.score,
        accuracy: record.accuracy,
        details: record.details,
        mods: record.mods,
        chart: () => chartQuery.getQuery(),
      })
      .setParameters(chartQuery.getParameters())
      .returning('"chartId", id')
      .execute()
      .catch((error) => {
        if (error.table === 'records' && error.column === 'chartId' && error.code === '23502') {
          throw new NotFoundError('The specified chart was not found.')
        }
        throw error
      })
  }
}

interface ILevelCreateSessionData {
  pkgName: string
  path: string
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
