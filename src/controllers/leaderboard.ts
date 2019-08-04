import {Validator} from 'class-validator'
import {Get, JsonController, NotFoundError, QueryParam} from 'routing-controllers'
import LeaderboardEntry from '../models/leaderboard'
import BaseController from './base'

const validator = new Validator()

@JsonController('/leaderboard')
export default class Leaderboard extends BaseController {
  @Get('/')
  public async leaderboard(
    @QueryParam('user') user: string,
    @QueryParam('limit') limit: number = 20,
    @QueryParam('page') page: number = 0,
  ) {
    if (limit > 100) {
      limit = 100
    } else if (limit < 1) {
      limit = 1
    }
    if (user) {
      return this.db.query(`
WITH lb AS (
  SELECT *, rank() OVER (ORDER BY rating DESC) FROM leaderboard
)
select lb.*, users.uid from lb JOIN users on users.id=lb.id
WHERE abs(lb.rank - (SELECT rank FROM lb where id=${
          validator.isUUID(user, '4') ?
            '$1' :
            '(SELECT id FROM users WHERE uid=$1)'})) < $2`,
        [user, limit])
        .then((results) => {
          for (const result of results) {
            result.rank = parseInt(result.rank, 10)
            result.rating = parseFloat(result.rating)
          }
          return results
        })
    } else {
      return this.db.createQueryBuilder()
        .select(['lb.rating', 'lb.id', 'rank() OVER (ORDER BY lb.rating DESC)'])
        .from(LeaderboardEntry, 'lb')
        .leftJoinAndSelect('lb.owner', 'owner')
        .limit(limit).offset(page * limit)
        .getRawAndEntities()
        .then(({raw, entities}) => {
          entities.forEach((entity: any, index) => {
            entity.rank = parseInt(raw[index].rank, 10)
            entity.rating = parseFloat(entity.rating)
          })
          return entities
        })
    }
  }
}
