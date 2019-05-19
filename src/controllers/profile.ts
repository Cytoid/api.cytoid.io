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
}
