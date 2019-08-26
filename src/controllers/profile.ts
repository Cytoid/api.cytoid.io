import { IsDateString, IsOptional, IsString, Validator } from 'class-validator'
import {
  Authorized, BadRequestError, Body,
  CurrentUser, Get, JsonController,
  NotFoundError, Param, Put, QueryParam, UnauthorizedError,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import {level} from 'winston'
import conf from '../conf'
import { redis } from '../db'
import Profile from '../models/profile'
import User, {IUser} from '../models/user'
import BaseController from './base'

const validator = new Validator()

class ProfileUpdateDTO {
  @IsDateString()
  @IsOptional()
  public birthday: string

  @IsString()
  public bio: string
}

@JsonController('/profile')
export default class ProfileController extends BaseController {
  private userRepo = getRepository(User)
  private profileRepo = getRepository(Profile)
  @Get('/:id')
  public async getProfile(@Param('id') id: string) {
    // Testing if the id is a uuid. Case insensitive.
    const profile: any = await this.db
      .createQueryBuilder(Profile, 'p')
      .innerJoinAndSelect('p.user', 'u')
      .addSelect([
        'u.registrationDate',
      ])
      .where(validator.isUUID(id, '4') ? 'p.id=:id' : 'u.uid=:id', { id })
      .getOne()
    if (!profile) {
      throw new NotFoundError()
    }
    profile.headerURL = profile.headerPath ? conf.assetsURL + '/' + profile.headerPath : null
    delete profile.user.id
    delete profile.headerPath
    return profile
  }

  @Get('/:id/full')
  public async getProfileFull(@Param('id') id: string) {
    const profile = await this.getProfile(id)
    const user = profile.user
    delete profile.user
    return {
      user,
      profile,
      rating: await this.personalRating(profile.id),
      grade: await this.gradeDistribution(profile.id),
      activities: await this.userActivity(profile.id),
      exp: await this.exp(profile.id),
      recents: {
        ranks: await this.recentRanks(profile.id),
      },
      levels: await this.levels(profile.id),
      timeseries: await this.timeseries(profile.id),
      online: await this.online(profile.id),
    }
  }

  @Get('/:id/grades')
  public gradeDistribution(@Param('id') uuid: string) {
    if (!validator.isUUID(uuid, '4')) {
      throw new BadRequestError('not uuid')
    }
    return this.db.query(`SELECT case
when records.score >= 1000000 then 'MAX'
when records.score >= 999500 then 'SSS'
when records.score >= 990000 then 'SS'
when records.score >= 950000 then 'S'
when records.score >= 900000 then 'A'
when records.score >= 800000 then 'B'
when records.score >= 700000 then 'C'
when records.score >= 600000 then 'D'
else 'F'
end as grade,
count(records) as count
from records
where records."ownerId" = $1
group by grade;`, [uuid])
    .then((gradeObjs) => {
      const grades: any = {}
      for (const grade of gradeObjs) {
        grades[grade.grade] = parseInt(grade.count, 10)
      }
      return grades
    })
  }

  @Get('/:id/activity')
  public userActivity(@Param('id') uuid: string) {
    if (!validator.isUUID(uuid, '4')) {
      throw new BadRequestError('not uuid')
    }
    return this.db.createQueryBuilder()
      .select([
        'count(records) filter (WHERE records.ranked=true) as total_ranked_plays',
        'sum(chart."notesCount") as cleared_notes',
        "max((records.details -> 'maxCombo')::integer) as max_combo",
        'avg(records.accuracy) as average_ranked_accuracy',
        'sum(records.score) filter (WHERE records.ranked=true) as total_ranked_score',
        'sum(level.duration) as total_play_time',
      ])
      .from('records', 'records')
      .innerJoin('charts', 'chart', 'records."chartId" = chart.id')
      .innerJoin('levels', 'level', 'level.id=chart."levelId"')
      .where('records."ownerId"=:uuid', { uuid })
      .execute()
      .then((results) => {
        const activities = results[0]
        activities.total_ranked_plays = parseInt(activities.total_ranked_plays, 10)
        activities.cleared_notes = parseInt(activities.cleared_notes, 10)
        activities.total_ranked_plays = parseInt(activities.total_ranked_plays, 10)
        activities.total_ranked_score = parseInt(activities.total_ranked_score, 10)
        activities.average_ranked_accuracy = parseFloat(activities.average_ranked_accuracy)
        return activities
      })

  }

  @Get('/:id/rating')
  public personalRating(@Param('id') uuid: string) {
    if (!validator.isUUID(uuid, '4')) {
      throw new BadRequestError('not uuid')
    }
    return this.db.query('select user_rating($1)', [ uuid ])
      .then((result) => parseFloat(result[0].user_rating) || 0)
  }

  @Get('/:id/exp')
  public exp(@Param('id') uuid: string) {
    if (!validator.isUUID(uuid, '4')) {
      throw new BadRequestError('not uuid')
    }
    return this.db.query(`
WITH scores AS (
 SELECT (charts."notesCount" * (charts.difficulty / 15.0) +
  levels.duration / 60.0 * 100.0) * (CASE WHEN records.ranked THEN 1 ELSE 0.5 END) AS base,
  records.score as score,
  levels.id as level
 FROM records
 JOIN charts on records."chartId" = charts.id
 JOIN levels on charts."levelId" = levels.id
 WHERE records."ownerId" = $1
  AND charts.difficulty BETWEEN 1 AND 16
),
chart_scores AS (
 SELECT max(pow(scores.score / 1000000.0, 2) * (scores.base * 1.5)) as level_score,
        sum(sqrt(scores.score / 1000000.0) * scores.base) as level_total_basic_exp
 FROM scores
 GROUP BY scores.level
)
SELECT round(sum(level_total_basic_exp)) as basic_exp,
       round(sum(chart_scores.level_score)) as level_exp
FROM chart_scores;`, [uuid])
      .then((result) => {
        const basicExp = result[0].basic_exp || 0
        const levelExp = result[0].level_exp || 0
        const totalExp = basicExp + levelExp
        const currentLevel = Math.floor((Math.sqrt(6 * totalExp + 400) + 10) / 30)
        function levelToExp(levelNum: number) {
          return Math.round(50 * ((1 / 3) * Math.pow(3 * levelNum - 1, 2) - (4 / 3)))
        }
        return {
          basicExp,
          levelExp,
          totalExp,
          currentLevel,
          nextLevelExp: levelToExp(currentLevel + 1),
          currentLevelExp: levelToExp(currentLevel),
        }
      })
  }

  @Get('/:id/ranks')
  public recentRanks(@Param('id') uuid: string) {
    if (!validator.isUUID(uuid, '4')) {
      throw new BadRequestError('not uuid')
    }
    return this.db.query(`
SELECT records.score, records.accuracy, records.date,
charts.difficulty, charts.type, charts."notesCount", charts.name as "chartName",
levels.uid, levels.title,
concat(files.path, '/', (files.content ->> 'background')) AS background_path,
(SELECT rank
FROM (SELECT a."ownerId", rank() OVER (ORDER BY max(a.score) DESC)
      FROM records a
      WHERE a."chartId" = records."chartId"
        AND a.ranked = true
      GROUP BY a."ownerId") b
WHERE b."ownerId" = $1)::integer rank
FROM (
         SELECT DISTINCT on (records."chartId") score, accuracy, date, "chartId"
         FROM records
         WHERE records."ownerId" = $1
           AND ranked = true
         ORDER BY records."chartId", records.score DESC
     ) records
         JOIN charts on records."chartId" = charts.id
         JOIN levels on charts."levelId" = levels.id
         JOIN files on levels."bundlePath" = files.path
ORDER BY records.date DESC LIMIT 10;`, [uuid])
      .then((results) => results.map((result: any) => {
        result.backgroundURL = conf.assetsURL + '/' + result.background_path
        result.accuracy = parseFloat(result.accuracy)
        delete result.background_path
        return result
      }))
  }

  @Get('/:id/levels')
  public levels(@Param('id') id: string) {
    if (!validator.isUUID(id, '4')) {
      throw new BadRequestError('not uuid')
    }
    return this.db.createQueryBuilder()
      .select([
        "count(levels.id) filter (WHERE 'featured'=ANY(levels.category)) as featured_levels_count",
        'count(levels.id) as total_levels_count',
      ])
      .from('levels', 'levels')
      .where('levels."ownerId"=:id', { id })
      .getRawOne()
      .then((value) => ({
        featuredLevelsCount: parseInt(value.featured_levels_count, 10),
        totalLevelsCount: parseInt(value.total_levels_count, 10),
      }))
  }

  @Get('/:id/timeseries')
  public timeseries(@Param('id') uuid: string) {
    if (!validator.isUUID(uuid, '4')) {
      throw new BadRequestError('not uuid')
    }
    return this.db.query(`\
SELECT (sum(t.rating * t.count) OVER w) / (sum(t.count) OVER w) as accu_rating,
       (sum(t.accuracy * t.count) OVER w) / (sum(t.count) OVER w) as accu_accuracy,
       t.*
FROM (
         SELECT extract(week from r.date) as week,
                extract(isoyear from r.date) as year,
                avg(accuracy) as accuracy,
                avg(rating) as rating,
                count(*)::integer
         FROM records r
         WHERE r."ownerId" = $1
         GROUP BY year, week
         ORDER BY year, week
     ) as t
     WINDOW w AS (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);`, [ uuid ])
      .then((rows) => {
        for (const row of rows) {
          row.accu_rating = parseFloat(row.accu_rating)
          row.accu_accuracy = parseFloat(row.accu_accuracy)
          row.accuracy = parseFloat(row.accuracy)
          row.rating = parseFloat(row.rating)
        }
        return rows
      })
  }

  public online(uuid: string) {
    return redis.getAsync('onlinestatus:' + uuid)
      .then((val) => val !== null)
  }

  @Put('/:id')
  @Authorized()
  public async updateProfile(
    @Param('id') id: string,
    @Body() profile: ProfileUpdateDTO,
    @CurrentUser() user: IUser,
  ): Promise<null> {
    const isUUID = validator.isUUID(id, '4')
    if (isUUID ? (id !== user.id) : (id !== user.uid)) {
      throw new UnauthorizedError()
    }
    await this.profileRepo.update({ id: user.id }, profile)
    return null
  }
}
