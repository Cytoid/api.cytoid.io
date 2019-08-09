import { plainToClass } from 'class-transformer'
import {Get, JsonController, QueryParam} from 'routing-controllers'
import Collection from '../models/collection'
import { Level } from '../models/level'
import BaseController from './base'

@JsonController('/collections')
export default class Collections extends BaseController {
  @Get('/')
  public getCollections(
    @QueryParam('page') page: number = 0,
    @QueryParam('limit') limit: number = 10,
  ) {
    if (page < 0) {
      page = 0
    }
    if (limit < 0) {
      limit = 0
    } else if (limit > 20) {
      limit = 20
    }
    return this.db.createQueryBuilder(Collection, 'c')
      .select([
        'c.id', 'c.uid', 'c.headerPath', 'c.title', 'c.brief', 'c.description',
        'json_agg(json_build_object(' +
          "'id', l.id," +
          "'version', l.version," +
          "'uid', l.uid," +
          "'title', l.title," +
          "'order', c_l.order," +
          "'bundle', json_build_object('path', bundle.path, 'content', bundle.content)" +
        ') ORDER BY c_l.order) as levels',
      ])
      .innerJoin('c.levels', 'l')
      .innerJoin('l.bundle', 'bundle')
      .groupBy('c.id')
      .limit(limit)
      .offset(page * limit)
      .getRawAndEntities()
      .then(({ raw, entities}) => {
        entities.forEach((entity, index) => {
          entity.levels = plainToClass(Level, raw[index].levels)
          // entity.levels = raw[index].levels
          for (const level of entity.levels) {
            (level as any).bundle = level.bundle.toPlain()
          }
        })
        return entities
      })
  }
}
