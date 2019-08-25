import {CurrentUser, Get, JsonController, QueryParam, UseBefore} from 'routing-controllers'
import {OptionalAuthenticate} from '../authentication'
import {Level} from '../models/level'
import {IUser} from '../models/user'
import BaseController from './base'

@JsonController('/tags')
export default class TagsController extends BaseController {
  @Get('/')
  public searchTag(@QueryParam('search') searchKey: string, @QueryParam('limit') limit: number = 10) {
    if (limit > 30) {
      limit = 30
    }
    const searchQuery = searchKey ?
      this.db.query(
        "SELECT tag FROM tags_search WHERE tsv @@ to_tsquery(plainto_tsquery($1)::text || ':*') LIMIT $2",
        [searchKey + ':*', limit],
      ) :
      this.db.query('SELECT tag FROM tags_search LIMIT $1', [limit])

    return searchQuery.then((result) => result.map((a: any) => a.tag))
  }
  @Get('/full')
  public searchFullText(
    @QueryParam('search') searchKey: string,
    @QueryParam('limit') limit: number = 10): any {
    if (limit > 30) {
      limit = 30
    } else if (limit < 1) {
      limit = 1
    }
    if (!searchKey) {
      return []
    }
    return this.db.query(`\
SELECT title, uid
FROM to_tsquery(coalesce(nullif(plainto_tsquery($1)::text, ''), $1) || ':*') query, levels_search
WHERE query @@ tsv OR levels_search.title LIKE '%' || $1 || '%'
ORDER BY ts_rank_cd(tsv, query) DESC
LIMIT $2;`, [searchKey, limit])
  }

  @UseBefore(OptionalAuthenticate)
  @Get('/levels')
  public searchLevels(
    @CurrentUser() user: IUser,
    @QueryParam('search') searchKey: string,
    @QueryParam('limit') limit: number = 10): any {
    if (limit > 30) {
      limit = 30
    } else if (limit < 1) {
      limit = 1
    }
    const query = this.db
      .createQueryBuilder(Level, 'l')
      .select(['l.id', 'l.uid', 'l.title'])
      .limit(limit)
    if (searchKey) {
      return query
        .where("l.uid LIKE '%'||:query||'%'", { query: searchKey })
        .getMany()
    } else {
      if (!user) {
        return []
      }
      return query
        .where('l.owner=:owner', { owner: user.id })
        .getMany()
    }
  }
}
