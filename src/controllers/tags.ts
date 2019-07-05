import {Get, JsonController, QueryParam} from 'routing-controllers'
import BaseController from './base'

@JsonController('/tags')
export default class TagsController extends BaseController{
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
  public searchFullText(@QueryParam('search') searchKey: string, @QueryParam('limit') limit: number = 10) {
    if (limit > 30) {
      limit = 30
    }
    if (searchKey === '') {
      return Promise.resolve([])
    }
    return this.db.query(`\
SELECT title, uid
FROM to_tsquery(coalesce(nullif(plainto_tsquery($1)::text, ''), $1) || ':*') query, levels_search
WHERE query @@ tsv
ORDER BY ts_rank_cd(tsv, query) DESC
LIMIT $2;`, [searchKey, limit])
  }
}
