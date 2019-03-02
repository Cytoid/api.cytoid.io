import User from 'models/user'
import {
  Get,
  JsonController,
} from 'routing-controllers'
import BaseController from './base'

@JsonController('/users')
export default class QuestionController extends BaseController {
  @Get('/')
  public all() {
    return ''
  }
}
