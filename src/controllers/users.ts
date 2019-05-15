import {
  IsDateString,
  IsEmail, IsOptional, IsString,
  MinLength, validate,
} from 'class-validator'
import {
  Authorized, Body,
  CurrentUser, ForbiddenError,
  Get,
  JsonController, Param,
  Post,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import {signJWT} from '../authentication'
import User, {Email, IUser} from '../models/user'
import Profile from '../models/profile'
import BaseController from './base'

class NewUser {
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
        {uid: id},
      ],
    })
  }

  @Post('/')
  public createUser(@Body() newUser: NewUser) {
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
      await transaction.update(User, {
        where: { id: user.id },
      }, {
        email: newUser.email,
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
        return {
          user,
          token: await signJWT(user.serialize()),
        }
      })
  }
}
