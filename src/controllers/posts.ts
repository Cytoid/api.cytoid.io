import {Get, JsonController, Param, QueryParam} from 'routing-controllers'
import {getRepository} from 'typeorm'
import PostEntity from '../models/post'
import BaseController from './base'

@JsonController('/posts')
export default class PostsController extends BaseController {
  private postsRepo = getRepository(PostEntity)

  @Get('/')
  public listPosts(
    @QueryParam('page') pageNum: number = 0,
    @QueryParam('limit') limit: number = 10,
  ) {
    if (pageNum < 0) {
      pageNum = 0
    }
    if (limit < 1) {
      limit = 1
    } else if (limit > 50) {
      limit = 50
    }
    return this.postsRepo.find({
      skip: limit * pageNum,
      take: pageNum,
    })
  }

  @Get('/:slug')
  public getPost(@Param('slug') slug: string) {
    return this.postsRepo.findOne({
      where: { slug },
      relations: ['owner'],
    })
  }
}
