import {JsonController, Get, QueryParam} from 'routing-controllers'
import {getRepository} from 'typeorm'
import conf from '../conf'
import Record from '../models/record'
import User from '../models/user'
import BaseController from './base'

@JsonController('/records')
export default class RecordsController extends BaseController {
  @Get('/')
  public getRecords(@QueryParam('limit') limit: number = 15) {
    if (limit > 50) {
      limit = 50
    } else if (limit < 1) {
      limit = 1
    }
    return this.db
      .createQueryBuilder(Record, 'r')
      .select([
        'r.score',
        'r.accuracy',
        'r.date',
        'chart.difficulty',
        'chart.type',
        'chart.notesCount',
        'chart.name',
        'level.uid',
        'level.title',
        "concat(bundle.path, '/', (bundle.content->>'background')) as background_path",
      ])
      .addSelect('(SELECT b.rank ' +
        'FROM (select a."ownerId", rank() OVER (ORDER BY max(a.score))' +
          'FROM records a ' +
          'WHERE a."chartId" = r."chartId" AND a.ranked=true ' +
          'GROUP BY a."ownerId") b ' +
          'WHERE b."ownerId" = r."ownerId")', 'rank')
      .innerJoinAndSelect('r.owner', 'owner')
      .innerJoin('r.chart', 'chart')
      .innerJoin('chart.level', 'level')
      .innerJoin('level.bundle', 'bundle')
      .where('r.ranked=true')
      .andWhere('level.published=true')
      .orderBy('r.id', 'DESC')
      .limit(limit)
      .getRawAndEntities()
      .then(({ raw, entities }) => {
        entities.forEach((record: any, index) => {
          const rawEntry = raw[index]
          record.rank = parseInt(rawEntry.rank, 10)
          record.chart.level.backgroundURL = conf.assetsURL + '/' + rawEntry.background_path
        })
        return entities
      })
  }
}
