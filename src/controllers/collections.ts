import { plainToClass } from 'class-transformer'
import { Get, JsonController, Param, QueryParam } from 'routing-controllers'
import {getRepository} from 'typeorm'
import Collection from '../models/collection'
import { Level } from '../models/level'
import BaseController from './base'

@JsonController('/collections')
export default class Collections extends BaseController {
  private repo = getRepository(Collection)

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
        'c.id', 'c.uid', 'c.coverPath', 'c.title', 'c.brief', 'c.description',
        'json_agg(json_build_object(' +
          "'id', l.id," +
          "'version', l.version," +
          "'uid', l.uid," +
          "'title', l.title," +
          "'order', c_l.order," +
          "'bundle', json_build_object('path', bundle.path, 'content', bundle.content)," +
          "'metadata', l.metadata" +
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
          for (const level of entity.levels) {
            delete level.metadata.raw
          }
        })
        return entities
      })
  }

  @Get('/:id')
  public getCollection(@Param('id') id: string) {
    return this.repo.find({
      where: { uid: id },
      relations: ['levels', 'owner', 'levels.bundle', 'levels.owner'],
    })
      .then(([result]) => {
        for (const level of result.levels) {
          delete level.metadata.raw
        }
        return result
      })
  }
}
