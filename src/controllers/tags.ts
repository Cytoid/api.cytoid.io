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
}
