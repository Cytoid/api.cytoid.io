import { authenticate } from 'koa-passport'
import {CurrentUser, JsonController, Post, Delete, UseBefore, Ctx} from 'routing-controllers'
import {signJWT} from '../authentication'
import User, { IUser } from '../models/user'
import BaseController from './base'
import {Context} from 'koa'

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

  @Delete('/')
  public logout(@Ctx() ctx: Context, @CurrentUser() user: IUser): null {
    ctx.logout()
    return null
  }
}
