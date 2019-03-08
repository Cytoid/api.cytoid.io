import {
  IsDateString,
  IsEmail, IsOptional, IsString,
  MinLength, validate,
} from 'class-validator'
import {
  Authorized, CurrentUser,
  Body, Param,
  ForbiddenError,
  Get, Post,
  JsonController,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import User, {IUser} from '../models/user'
import BaseController from './base'

class NewUser {
  @IsString()
  public name: string

  @IsString()
  @IsOptional()
  public uid: string

  @MinLength(8)
  public password: string

  @IsEmail()
  public email: string

  @IsOptional()
  @IsDateString()
  public birthday?: string

  public async create(): Promise<User> {
    const user = new User()
    user.name = this.name
    await user.setPassword(this.password)
    user.email = this.email
    user.uid = this.uid
    user.birthday = this.birthday ? new Date(Date.parse(this.birthday)) : null
    return user
  }
}

@JsonController('/users')
export default class UserController extends BaseController {
  public repo = getRepository(User)

  @Get('/')
  @Authorized()
  public getCurrentUser(@CurrentUser() user: IUser) {
    return this.repo.findOne(user.id)
  }

  @Get('/:id')
  public getUser(@Param("id") id: string): Promise<User|string> {
    return this.repo.findOne({
      where: [
        {uid: id},
      ]
    })
  }

  @Post('/')
  public createUser(@Body() newUser: NewUser): Promise<User|string> {
    return newUser.create()
      .then((user) => this.db.save(user))
      .catch((error) => {
        if (error.constraint === 'USER_EMAIL_UNIQUE') {
          throw new ForbiddenError('duplicated email address')
        } else if (error.constraint === 'USER_UID_UNIQUE') {
          throw new ForbiddenError('duplicated uid')
        }
        return 'error'
      })
  }
}
