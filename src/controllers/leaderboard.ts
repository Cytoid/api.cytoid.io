import {Get, JsonController, NotFoundError, QueryParam} from 'routing-controllers'
import LeaderboardEntry from '../models/leaderboard'
import User from '../models/user'
import BaseController from './base'

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
    let query = this.db.createQueryBuilder()
      .select(['lb.rating', 'lb.ranking', 'lb.ownerId'])
      .from(LeaderboardEntry, 'lb')
      .leftJoinAndSelect('lb.owner', 'owner')
      .orderBy('lb.ranking')
    if (user) {
      const ranking = await this.db.createQueryBuilder()
        .select('lb.ranking::integer')
        .from(LeaderboardEntry, 'lb')
        .where('"ownerId"=(select id from users where uid=:user)', { user })
        .getRawOne()
        .then((a) => a && a.ranking)
      if (!ranking) {
        throw new NotFoundError()
      }
      query = query.where('abs(:ranking - lb.ranking) <= :limit', { limit, ranking })
    } else {
      query = query.limit(limit).offset(page * limit)
    }
    return query
      .getMany()
      .then( (a) => a.map((b: any) => {
        b.rank = parseInt(b.ranking, 10)
        delete b.ranking
        return b
      }))
  }
}
