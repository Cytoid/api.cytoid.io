import {Context} from 'koa'
import { authenticate } from 'koa-passport'
import {CurrentUser, JsonController, Put, UseBefore} from 'routing-controllers'
import {signJWT} from '../authentication'
import User, { IUser } from '../models/user'
import BaseController from './base'

@JsonController('/session')
export default class UserController extends BaseController {
  @Put('/')
  @UseBefore(authenticate('local'))
  public async login(@CurrentUser() user: User) {
    const serializedUser: IUser = {
      email: user.email,
      id: user.id,
      name: user.name,
      uid: user.uid,
    }
    const token = await signJWT(serializedUser)
    return {
      token,
      user,
    }
  }
}
