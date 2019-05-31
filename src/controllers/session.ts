import {Context} from 'koa'
import { authenticate } from 'koa-passport'
import {
  Authorized,
  BodyParam,
  Ctx,
  CurrentUser,
  Delete,
  Get,
  HttpCode,
  InternalServerError, JsonController, NotFoundError,
  Param,
  Post, UseBefore,
} from 'routing-controllers'
import {signJWT} from '../authentication'
import config from '../conf'
import eventEmitter from '../events'
import CaptchaMiddleware from '../middlewares/captcha'
import User, {IUser} from '../models/user'
import MailClient from '../utils/mail'
import PasswordManager from '../utils/password'
import {VerificationCodeManager} from '../utils/verification_code'
import BaseController from './base'

const CodeVerifier = new VerificationCodeManager('password_reset')

@JsonController('/session')
export default class UserController extends BaseController {
  @Post('/')
  @UseBefore(authenticate('local'))
  @UseBefore(CaptchaMiddleware('login'))
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

  @Get('/')
  @Authorized()
  public status(@Ctx() ctx: Context, @CurrentUser() user: IUser): any {
    return {
      user,
    }
  }

  @HttpCode(202)
  @Post('/reset')
  @UseBefore(CaptchaMiddleware('reset_password'))
  public async resetPasswordStart(@BodyParam('email') email: string) {
    email = email.toLowerCase()
    const user = await this.db
      .createQueryBuilder('emails', 'emails')
      .innerJoin('users', 'users', 'users.id=emails."ownerId"')
      .select(['users.id', 'users.uid', 'users.name'])
      .where('emails.address=:email', { email })
      .andWhere('emails.verified=true')
      .getRawOne()
    if (!user) {
      return
    }
    user.email = email
    const code = await CodeVerifier.generate(email)

    return MailClient.sendWithRemoteTemplate('password-reset', user, {
      url: config.webURL + '/session/reset/' + code,
    })
      .then(() => {
        return null
      })
      .catch(() => {
        throw new InternalServerError('Email server not available')
      })
  }

  @HttpCode(202)
  @Post('/reset/:code')
  @UseBefore(CaptchaMiddleware('reset_password_continue'))
  public async resetPassword(@Param('code') code: string, @BodyParam('password') password: string) {
    const email = await CodeVerifier.makeInvalidate(code)
    if (!email) {
      throw new NotFoundError('The verification code is not valid.')
    }

    const hashedPassword = await PasswordManager.hash(password)
    await this.db.createQueryBuilder()
      .update(User)
      .set({ password: hashedPassword })
      .where('id = (SELECT "ownerId" FROM emails WHERE emails.address=:email)', { email })
      .execute()
    eventEmitter.emit('password_change')
    return true
  }
}
