import { authenticate } from 'koa-passport'
import {CurrentUser, JsonController, Post, UseBefore} from 'routing-controllers'
import {signJWT} from '../authentication'
import User, { IUser } from '../models/user'
import BaseController from './base'

@JsonController('/session')
export default class UserController extends BaseController {
  @Post('/')
  @UseBefore(authenticate('local'))
  public async login(@CurrentUser() user: User) {
    const token = await signJWT(user.serialize())
    return {
      token,
      user,
    }
  }
}
