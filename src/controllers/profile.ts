import {Get, JsonController, NotFoundError, Param, QueryParam} from 'routing-controllers'
import {getRepository} from 'typeorm'
import {level} from 'winston'
import conf from '../conf'
import Profile from '../models/profile'
import User from '../models/user'
import { Validator } from 'class-validator'
import BaseController from './base'

const validator = new Validator()

@JsonController('/profile')
export default class ProfileController extends BaseController {
  private userRepo = getRepository(User)
  private profileRepo = getRepository(Profile)
  @Get('/:id')
  public async getProfile(@Param('id') id: string, @QueryParam('stats') stats: boolean = false) {
    // Testing if the id is a uuid. Case insensitive.
    const user = await this.userRepo.findOne({
      where: validator.isUUID(id, '4') ? {id} : {uid: id},
    })
    if (!user) {
      throw new NotFoundError()
    }
    const profile: any = await this.profileRepo.findOne({
      where: {id: user.id},
    })
    profile.headerURL = conf.assetsURL + '/' + profile.headerPath
    delete profile.headerPath
    if (!stats) {
      return profile
    }
    delete profile.id
    return {
      user,
      profile,
      rating: await this.personalRating(user.id),
      grade: await this.gradeDistribution(user.id),
      activities: await this.userActivity(user.id),
      exp: await this.exp(user.id),
      recents: {
        ranks: await this.recentRanks(user.id),
      },
      levels: await this.levels(user.id),
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
    return this.db.query(`
SELECT avg(performance_rating * difficulty_rating) as rating
FROM (select r.accuracy,
CASE
WHEN r.accuracy < 0.7 THEN ((|/ (r.accuracy / 0.7)) * 0.5)
WHEN r.accuracy < 0.97 THEN 0.7 - 0.2 * log((1.0 - r.accuracy) / 0.03)
WHEN r.accuracy < 0.997 THEN 0.7 - 0.16 * log((1.0 - r.accuracy) / 0.03)
WHEN r.accuracy < 0.9997 THEN 0.78 - 0.08 * log((1.0 - r.accuracy) / 0.03)
ELSE r.accuracy * 200.0 - 199.0 END as performance_rating,
c.difficulty as difficulty_rating
FROM records as r
JOIN charts c ON r."chartId" = c.id
WHERE r."ownerId"=$1) as v;`, [uuid])
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
 SELECT max(pow(scores.score / 1000000, 2) * (scores.base * 1.5)) as score
 FROM scores
 GROUP BY scores.level
)
SELECT sum(sqrt(scores.score / 1000000) * scores.base) as basic_exp,
       sum(chart_scores.score) as level_exp
FROM scores, chart_scores;`, [uuid])
      .then((result) => {
        const basicExp = result[0].basic_exp
        const levelExp = result[0].level_exp
        const totalExp = basicExp + levelExp
        const currentLevel = Math.floor(1 / 30 * (Math.sqrt(6 * totalExp + 400) + 20) + 1)
        const nextLevelExp = Math.round(150 * (currentLevel * currentLevel) - 200 * currentLevel)
        return {
          basicExp,
          levelExp,
          totalExp,
          currentLevel,
          nextLevelExp,
        }
      })
  }

  public recentRanks(uuid: string) {
    return this.db.query(`
select ranking.score, ranking.accuracy, ranking.rank, ranking.date,
   charts.difficulty, charts.type, charts."notesCount", charts.name as chart_name,
   levels.uid, levels.title, concat(files.path, '/', (files.content->>'background')) as background_path
from (select r.*, rank() over (partition by r."chartId" order by r.score desc)
      from records r
      where r.ranked = true) ranking
         join (select max(r.score) as max_score, r."chartId"
               from records r
               where r."ownerId" = $1
               group by r."chartId") max_scores
              on max_scores."chartId" = ranking."chartId" and max_scores.max_score = ranking.score
join charts on charts.id=ranking."chartId"
join levels on charts."levelId" = levels.id
join files on files.type='bundle' and files.path=levels."bundlePath"
order by ranking.date desc
limit 10;
`, [uuid])
      .then((results) => results.map((result: any) => {
        result.backgroundURL = conf.assetsURL + '/' + result.background_path
        delete result.background_path
        return result
      }))
  }

  public levels(id: string) {
    return this.db.createQueryBuilder()
      .select([
        'count(levels.id) filter (where (levels.metadata->\'featured\')::boolean=true) as featured_levels_count',
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
}
