import {
  IsEmail, IsOptional, IsString,
  MinLength, Validator,
} from 'class-validator'
import {
  Authorized, BadRequestError, Body, BodyParam,
  CurrentUser, ForbiddenError,
  Get,
  JsonController, Param,
  Post, Put, UnauthorizedError,
  HttpCode, UseBefore,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import {signJWT} from '../authentication'
import eventEmitter from '../events'
import Profile from '../models/profile'
import User, {Email, IUser} from '../models/user'
import BaseController from './base'
import CaptchaMiddleware from '../middlewares/captcha'

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
      where: [
        validator.isUUID(id, '5') ? { id } : { uid: id },
      ],
    })
  }

  @Post('/')
  @UseBefore(CaptchaMiddleware('signup'))
  public createUser(@Body() newUser: NewUserDto) {
    newUser.email = newUser.email.toLowerCase()
    if (newUser.uid) {
      newUser.uid = newUser.uid.toLowerCase()
    }
    return this.db.transaction(async (transaction) => {
      let user = new User()
      user.name = newUser.name
      user.uid = newUser.uid
      await user.setPassword(newUser.password)

      user = await transaction.save(user)
      await transaction.insert(Email, {
        address: newUser.email,
        ownerId: user.id,
      })
      await transaction.insert(Profile, {
        id: user.id,
      })
      await transaction.update(User, {id: user.id }, { email: newUser.email })
      user.email = newUser.email
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
    @BodyParam('primary') primary: boolean = false,
  ) {
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
      .then(async () => {
        if (primary) {
          await this.db.createQueryBuilder(User, 'users')
            .update()
            .set({ email })
            .where('users.id=:id', {id})
            .execute()
        }
      })
      .then(() => this.getUserEmails(id, user))
  }

  @Put('/:id/emails')
  @Authorized()
  @HttpCode(202)
  public replacePrimaryEmail(@Param('id') id: string, @BodyParam('email') email: string, @CurrentUser() user: IUser) {
    if (user.id !== id) {
      throw new UnauthorizedError()
    }
    if (!validator.isEmail(email)) {
      throw new BadRequestError('email not valid')
    }
    if (user.email === email) {
      return Promise.resolve(null)
    }
    return this.db.transaction(async (transaction) => {
      await transaction.createQueryBuilder(Email, 'emails')
        .delete()
        .where(
          'emails.address=(SELECT email FROM users WHERE users.id=:id) AND emails."ownerId" = :id',
          { id },
        )
        .execute()
      await transaction.createQueryBuilder(Email, 'emails')
        .insert()
        .values({ address: email, verified: false, ownerId: id})
        .onConflict('DO NOTHING')
        .execute()
      await transaction.createQueryBuilder(User, 'users')
        .update()
        .set({ email })
        .where({ id })
        .execute()
      return null
    })
  }
}
