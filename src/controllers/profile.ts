import {Get, JsonController, Param} from 'routing-controllers'
import {getRepository} from 'typeorm'
import Profile from '../models/profile'
import User from '../models/user'
import BaseController from './base'

@JsonController('/profile')
export default class ProfileController extends BaseController {
  private userRepo = getRepository(User)
  private profileRepo = getRepository(Profile)
  @Get('/:id')
  public async getProfile(@Param('id') id: string) {
    // Testign if the id is a uuid. Case insensitive.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    const user = await this.userRepo.findOne({
      where: isUUID ? {id} : {uid: id},
    })
    const profile = await this.profileRepo.findOne({
      where: {id: user.id},
    })
    delete profile.id
    return {
      user,
      profile,
      rating: await this.personalRating(user.id),
      grade: await this.gradeDistribution(user.id),
      activities: await this.userActivity(user.id),
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
    const activities = this.db.createQueryBuilder()
      .select([
        'count(records) as total_ranked_plays',
        "max((records.details -> 'maxCombo')::integer) as max_combo",
        'avg(records.accuracy) as average_ranked_accuracy',
        'sum(records.score) as total_ranked_score',
      ])
      .from('records', 'records')
      .where('records."ownerId"=:uuid', { uuid })
      .execute()
    return activities
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
}
