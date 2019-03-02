import User from '../models/user'
import {
  Get,
  JsonController,
} from 'routing-controllers'
import BaseController from './base'
import {getRepository} from 'typeorm'

@JsonController('/users')
export default class QuestionController extends BaseController {
  repo = getRepository(User)
  @Get('/')
  public all() {
    console.log(this.db)
    return 'ffff'
  }
}
