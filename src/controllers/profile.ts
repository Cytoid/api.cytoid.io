import { IsDateString, IsOptional, IsString, Validator } from 'class-validator'
import {
  Authorized, Body,
  CurrentUser, Get, JsonController,
  NotFoundError, Param, Put, QueryParam, UnauthorizedError,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import {level} from 'winston'
import conf from '../conf'
import Profile from '../models/profile'
import User, {IUser} from '../models/user'
import BaseController from './base'
import { redis } from '../db'

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
  public async getProfile(@Param('id') id: string, @QueryParam('stats') stats: boolean = false) {
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
    profile.headerURL = conf.assetsURL + '/' + profile.headerPath
    delete profile.user.id
    delete profile.headerPath
    if (!stats) {
      return profile
    }
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

  public gradeDistribution(uuid: string) {
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
        grades[grade.grade] = grade.count
      }
      return grades
    })
  }

  public userActivity(uuid: string) {
    return this.db.createQueryBuilder()
      .select([
        'count(records) as total_ranked_plays',
        'sum(chart."notesCount") as cleared_notes',
        "max((records.details -> 'maxCombo')::integer) as max_combo",
        'avg(records.accuracy) as average_ranked_accuracy',
        'sum(records.score) as total_ranked_score',
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
        return activities
      })

  }

  public personalRating(uuid: string) {
    return this.db.query(`\
SELECT avg(r.performance_rating * r.difficulty_rating) as rating
FROM records_ratings r
WHERE r."ownerId"=$1;`, [uuid])
      .then((result) => result[0].rating)
  }

  public exp(uuid: string) {
    return this.db.query(`
WITH scores AS (
 SELECT charts."notesCount" * (charts.difficulty / 15) +
  levels.duration / 60 * 100 * (CASE WHEN records.ranked THEN 1 ELSE 0.5 END) AS base,
  records.score as score,
  levels.id as level
 FROM records
 JOIN charts on records."chartId" = charts.id
 JOIN levels on charts."levelId" = levels.id
 WHERE records."ownerId" = $1
  AND charts.difficulty BETWEEN 1 AND 16
),
chart_scores AS (
 SELECT max(pow(scores.score / 1000000.0, 2) * (scores.base * 1.5)) as score
 FROM scores
 GROUP BY scores.level
)
SELECT round(sum(sqrt(scores.score / 1000000.0) * scores.base)) as basic_exp,
       round(sum(chart_scores.score)) as level_exp
FROM scores, chart_scores;`, [uuid])
      .then((result) => {
        const basicExp = result[0].basic_exp
        const levelExp = result[0].level_exp
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

  public recentRanks(uuid: string) {
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
        delete result.background_path
        return result
      }))
  }

  public levels(id: string) {
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

  public timeseries(uuid: string) {
    return this.db.query(`\
SELECT (sum(t.rating * t.count) OVER w) / (sum(t.count) OVER w) as accu_rating,
       (sum(t.accuracy * t.count) OVER w) / (sum(t.count) OVER w) as accu_accuracy,
       t.*
FROM (
         SELECT extract('week' from r.date) as week,
                extract('isoyear' from r.date) as year,
                avg(performance_rating * difficulty_rating) as rating,
                avg(accuracy) as accuracy,
                count(*)::integer
         FROM records_ratings r
         WHERE r."ownerId" = $1
         GROUP BY year, week
         ORDER BY year, week
     ) as t
     WINDOW w AS (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);`, [ uuid ])
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
