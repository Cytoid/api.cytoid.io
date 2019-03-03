import {
  IsDateString,
  IsEmail, IsOptional, IsString,
  MinLength, validate,
} from 'class-validator'
import {
  Body,
  Get,
  JsonController, Post,
} from 'routing-controllers'
import {getRepository} from 'typeorm'
import User from '../models/user'
import BaseController from './base'

class NewUser {
  @IsString()
  public name: string

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
    user.setPassword(this.password)
    user.email = this.email
    user.birthday = new Date(Date.parse(this.birthday))
    return user
  }
}

@JsonController('/users')
export default class UserController extends BaseController {
  public repo = getRepository(User)
  @Post('/')
  public createUser(@Body({ validate: true }) user: NewUser) {
    console.log(user)
    return 'tgg'
  }
}
