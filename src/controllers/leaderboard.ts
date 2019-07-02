import {Get, JsonController} from 'routing-controllers'
import LeaderboardEntry from '../models/leaderboard'
import User from '../models/user'
import BaseController from './base'

@JsonController('/leaderboard')
export default class Leaderboard extends BaseController{
  @Get('/')
  public leaderboard() {
    return this.db.createQueryBuilder()
      .select(['lb.rating', 'lb.ranking', 'lb.ownerId'])
      .from(LeaderboardEntry, 'lb')
      .leftJoinAndSelect('lb.owner', 'owner')
      .getMany()
  }
}
