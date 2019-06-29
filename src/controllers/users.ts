import {
  IsEmail, IsOptional, IsString,
  MinLength, Validator,
} from 'class-validator'
import {
  Authorized, BadRequestError, Body, BodyParam,
  CurrentUser, Delete,
  ForbiddenError,
  Get, HttpCode,
  JsonController, NotFoundError, Param,
  Post, Put,
  Patch, UnauthorizedError, UseBefore, Redirect,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import {signJWT} from '../authentication'
import config from '../conf'
import eventEmitter from '../events'
import CaptchaMiddleware from '../middlewares/captcha'
import Profile from '../models/profile'
import User, {Email, IUser} from '../models/user'
import MailClient from '../utils/mail'
import {VerificationCodeManager} from '../utils/verification_code'
import BaseController from './base'
const CodeVerifier = new VerificationCodeManager('email_verification')

const validator = new Validator()

class NewUserDto {
  @IsString()
  @IsOptional()
  public name?: string

  @IsString()
  @IsOptional()
  public uid?: string

  @MinLength(8)
  public password: string

  @IsEmail()
  @IsOptional()
  public email?: string
}

@JsonController('/users')
export default class UserController extends BaseController {
  private repo = getRepository(User)

  @Get('/')
  @Authorized()
  public getCurrentUser(@CurrentUser() user: IUser) {
    return this.repo.findOne(user.id)
  }

  @Get('/:id')
  public getUser(@Param('id') id: string): Promise<User|string> {
    return this.repo.findOne({
      where: validator.isUUID(id, '4') ? { id } : { uid: id },
    })
  }

  @Get('/:id/avatar')
  @Redirect('https://google.com') // TO
  public getAvatar(@Param('id') id: string) {
    return this.repo.findOne({
      select: ['email', 'avatarPath'],
      where: validator.isUUID(id, '4') ? { id } : { uid: id },
    }).then((user) => {
      if (!user) {
        throw new NotFoundError()
      }
      return user.avatarURL
    })
  }

  @Delete('/:id/avatar')
  @Authorized()
  public async deleteAvatar(@Param('id') id: string, @CurrentUser() user: IUser): Promise<null> {
    const isUUID = validator.isUUID(id, '4')
    if (isUUID ? (id !== user.id) : (id !== user.uid)) {
      throw new UnauthorizedError()
    }
    await this.repo.update(
      validator.isUUID(id, '4') ? { id } : { uid: id },
      { avatarPath: null },
    )
    return null
  }

  @Put('/:id')
  @Authorized()
  public editUser(@Param('id') id: string, @CurrentUser() user: IUser, @Body() newUser: IUser) {
    if (user.id !== id) {
      throw new UnauthorizedError()
    }
    return this.db.createQueryBuilder()
      .update(User)
      .set({ uid: newUser.uid, name: newUser.name })
      .where('id=:id', { id })
      .execute()
  }

  @Post('/')
  @UseBefore(CaptchaMiddleware('signup'))
  public createUser(@Body() newUser: NewUserDto) {
    if (newUser.email) {
      newUser.email = newUser.email.toLowerCase()
    }
    if (newUser.uid) {
      newUser.uid = newUser.uid.toLowerCase()
    }
    return this.db.transaction(async (transaction) => {
      let user = new User()
      user.name = newUser.name
      user.uid = newUser.uid
      await user.setPassword(newUser.password)

      user = await transaction.save(user)
      if (newUser.email) {
        await transaction.insert(Email, {
          address: newUser.email,
          ownerId: user.id,
        })
        await transaction.update(User, {id: user.id }, { email: newUser.email })
        user.email = newUser.email
      }
      await transaction.insert(Profile, {
        id: user.id,
      })
      return user
    })
      .catch((error) => {
        if (error.constraint === 'emails_pkey') {
          throw new ForbiddenError('duplicated email address')
        } else if (error.constraint === 'USER_UID_UNIQUE') {
          throw new ForbiddenError('duplicated uid')
        }
        throw error
      })
      .then(async (user) => {
        eventEmitter.emit('user_new', user)
        return {
          user,
          token: await signJWT(user.serialize()),
        }
      })
  }

  @Get('/:id/emails')
  @Authorized()
  public getUserEmails(@Param('id') id: string, @CurrentUser() user: IUser) {
    if (user.id !== id) {
      throw new UnauthorizedError()
    }
    return this.db.createQueryBuilder(Email, 'emails')
      .select(['emails.address as address', 'emails.verified as verified', '(emails.address=owner.email) as primary'])
      .where('owner.id=:id', { id })
      .innerJoin('users', 'owner', 'owner.id=emails."ownerId"')
      .getRawMany()
  }

  @Post('/:id/emails')
  @HttpCode(201)
  @Authorized()
  public addUserEmail(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @BodyParam('email', {required: true}) email: string,
  ) {
    email = email.toLowerCase()
    if (!validator.isEmail(email)) {
      throw new BadRequestError('email not valid')
    }
    if (user.id !== id) {
      throw new UnauthorizedError()
    }
    return this.db.createQueryBuilder(Email, 'emails')
      .insert()
      .values({
        address: email,
        verified: false,
        ownerId: user.id,
      })
      .execute()
      .catch((error) => {
        if (error.constraint === 'emails_pkey') {
          throw new BadRequestError('duplicated email address')
        }
        throw error
      })
      .then(() => this.getUserEmails(id, user))
  }

  @Patch('/:id/emails/:email')
  @Authorized()
  @HttpCode(204)
  public setPrimaryEmail(
    @Param('id') id: string,
    @Param('email') email: string,
    @BodyParam('primary') primary: boolean,
    @CurrentUser() user: IUser) {
    if (user.id !== id) {
      throw new UnauthorizedError()
    }
    email = email.toLowerCase()
    if (primary) {
      return this.db.query(
        'UPDATE users SET email=$1 WHERE id=$2 AND id=(SELECT id FROM emails WHERE address=$1)',
        [email, id])
        .catch((error) => {
          if (error.constraint === 'users_email_pkey') {
            throw new NotFoundError('email not found')
          }
          throw error
        })
    } else {
      return this.db.query('UPDATE users SET email=NULL WHERE id=$1', [id])
    }
  }

  @Delete('/:id/emails/:email')
  @Authorized()
  @HttpCode(204)
  public deleteEmail(@CurrentUser() user: IUser, @Param('id') userId: string, @Param('email') email: string) {
    if (userId !== user.id) {
      throw new UnauthorizedError()
    }
    email = email.toLowerCase()
    return this.db.createQueryBuilder()
      .delete()
      .from('emails')
      .where('address=:email AND "ownerId"=:userId', { email, userId })
      .execute()
      .then((result) => (result.affected === 0) ? Promise.reject(new NotFoundError()) : Promise.resolve(true))
  }

  @Post('/:id/emails/:email/verify')
  @Authorized()
  @HttpCode(202)
  public verifyEmail(@CurrentUser() user: IUser, @Param('id') userId: string, @Param('email') email: string) {
    if (userId !== user.id) {
      throw new UnauthorizedError()
    }
    email = email.toLowerCase()
    return this.db.createQueryBuilder()
      .select('verified', 'verified')
      .from('emails', 'e')
      .where('e.address=:email AND e."ownerId"=:userId', { email, userId })
      .getRawOne()
      .then((item) => {
        if (!item) {
          throw new NotFoundError()
        }
        if (item.verified) {
          throw new ForbiddenError('already verified')
        }
        return CodeVerifier.generate(email)
      })
      .then((token) => {
        MailClient.sendWithRemoteTemplate('email-confirm',
          { name: user.name || user.uid, email },
          { url: config.apiURL + `/users/${userId}/emails/${email}/verify/${token}`})
        return null
      })
  }

  @Get('/:id/emails/:email/verify/:token')
  public async confirmEmail(@Param('id') userId: string, @Param('email') email: string, @Param('token') token: string) {
    email = email.toLowerCase()
    if (await CodeVerifier.makeInvalidate(token) !== email) {
      return 'The token was expired.'
    }
    await this.db.query(
      'UPDATE emails SET verified=true WHERE verified=false AND address=$1 AND "ownerId"=$2',
      [email, userId])

    return 'Your email was successfully confirmed!'
  }
}
