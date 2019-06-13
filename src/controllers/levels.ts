import {Type} from 'class-transformer'
import {
  ArrayUnique,
  IsBoolean, IsInstance, IsInt, IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import {Context} from 'koa'
import {
  Authorized,
  BadRequestError,
  Body,
  BodyParam,
  ContentType,
  Ctx,
  CurrentUser,
  ForbiddenError,
  Get, HttpError, JsonController, NotFoundError, Param,
  Post, QueryParam, Redirect, UseBefore,
} from 'routing-controllers'
import {getRepository, In, SelectQueryBuilder} from 'typeorm'

import {resolve as resolveURL} from 'url'
import {OptionalAuthenticate} from '../authentication'
import conf from '../conf'
import {redis} from '../db'
import CaptchaMiddleware from '../middlewares/captcha'
import File from '../models/file'
import {Chart, ILevelBundle, Level, Rating} from '../models/level'
import Record, {RecordDetails} from '../models/record'
import { IUser } from '../models/user'
import Storage from '../storage'
import BaseController from './base'

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
      relations: ['bundle', 'charts', 'owner', 'package'],
    })
      .then((levels) => {
        if (levels.length === 0) {
          return undefined
        }
        const level = levels[0]

        level.charts.sort((a, b) => a.difficulty - b.difficulty)

        const result: any = level
        result.bundle = level.bundle.toPlain()

        result.packageSize = result.package.size
        delete result.package
        delete result.packagePath
        delete result.metadata.raw

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
  @UseBefore(OptionalAuthenticate)
  public async getLevels(
    @CurrentUser() user: IUser,
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
      .leftJoin('levels.bundle', 'bundle', "bundle.type='bundle' AND bundle.created=true")
      .leftJoin('levels.owner', 'owner')
      .leftJoin('levels.charts', 'charts')
      .select([
        'levels.title',
        'levels.id',
        'levels.uid',
        'levels.metadata',
        'bundle.content',
        'bundle.path',
        'json_agg(charts ORDER BY charts.difficulty) as charts',
        '(SELECT avg(level_ratings.rating) FROM level_ratings WHERE level_ratings."levelId"=levels.id) as rating',
      ])
      .orderBy(keyMap[ctx.request.query.sort] || 'levels.date_created',
        (sortOrder.toLowerCase() === 'desc') ? 'DESC' : 'ASC')
      .groupBy('levels.id, bundle.path, owner.id')
      .limit(pageLimit)
      .offset(pageLimit * pageNum)
    {
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
      if (ctx.request.query.max_difficulty) {
        theChartsQb = chartsQb().andWhere(
          'charts.difficulty <= :difficulty',
          { difficulty: ctx.request.query.max_difficulty})
      }
      if (ctx.request.query.min_difficulty) {
        theChartsQb = chartsQb().andWhere(
          'charts.difficulty >= :difficulty',
          { difficulty: ctx.request.query.min_difficulty })
      }
      if (theChartsQb) {
        query = query.andWhere(`EXISTS${theChartsQb.getQuery()}`, theChartsQb.getParameters())
      }
    }
    if (ctx.request.query.date_start) {
      query = query.andWhere('levels.date_created >= :date', {date: ctx.request.query.date_start})
    }
    if (ctx.request.query.date_end) {
      query = query.andWhere('levels.date_created <= :date', {date: ctx.request.query.date_end})
    }
    if ('featured' in ctx.request.query) {
      query = query.andWhere("(levels.metadata->'featured')::boolean=true")
    }
    if ('tags' in ctx.request.query) {
      query = query.addSelect('levels.tags')
      if (ctx.request.query.tags) {
        const tags = ctx.request.query.tags.split('|')
        query = query
          .andWhere('levels.tags@>:tags', { tags })
      }
    }
    if (ctx.request.query.uploader) {
      query = query.andWhere('owner.id=:id', { id: ctx.request.query.uploader })
        .addSelect([
          'levels.downloads',
          '(SELECT count(*) FROM records ' +
          'JOIN charts ON charts.id=records."chartId" ' +
          'WHERE charts."levelId"=levels.id) as plays',
          'levels.modificationDate',
          'levels.creationDate',
        ])
    } else {
      query = query.addSelect([
        'owner.uid',
        'owner.email',
        'owner.name',
      ])
    }
    // Exclude the unpublished levels or censored levels unless it's the uploader querying himself
    if (!ctx.request.query.uploader || ctx.request.query.uploader !== user.id) {
      query = query.andWhere("levels.published=true AND (levels.censored IS NULL OR levels.censored='ccp')")
    }
    return Promise.all([query.getRawAndEntities(), query.getCount()])
      .then(([{entities, raw}, count]) => {
        ctx.set('X-Total-Page', Math.floor(count / this.levelsPerPage).toString())
        ctx.set('X-Total-Entries', count.toString())
        ctx.set('X-Current-Page', pageNum.toString())
        return entities.map((level: any, index) => {
          const rawRecord = raw[index]
          console.log(level)
          level.bundle = level.bundle.toPlain()
          level.charts = rawRecord.charts
          level.rating = parseFloat(rawRecord.rating) || null
          level.plays = rawRecord.plays || 0
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

  @Get('/:id/package')
  @Authorized()
  @Redirect(':assetsURL/:path')
  public async downloadPackage(@Param('id') id: string) {
    const path = await this.db.query(`
UPDATE levels
SET downloads=downloads+1
WHERE uid=$1
RETURNING "packagePath"`, [id])
      .then((a) => a[0].packagePath)
    return {
      path,
      assetsURL: conf.assetsURL,
    }
  }
}
