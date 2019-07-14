import { Exclude, Expose, Type } from 'class-transformer'
import { createHash } from 'crypto'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn, ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm'
import MailTransport, {ITransport as IMailTransport} from '../utils/mail'

import config from '../conf'
import PasswordManager from '../utils/password'
import File from './file'

export interface IUser {
  id: string
  uid?: string
  name: string
  email?: string
}

@Entity('users')
export default class User implements IUser {
  @PrimaryGeneratedColumn('uuid')
  public id: string

  @Column({ unique: true, nullable: true })
  public uid?: string

  @Column()
  public name: string

  @Column({ unique: true })
  @Exclude()
  public email: string

  @Type(() => File)
  @ManyToOne(() => File, (file) => file.path)
  @Exclude()
  public avatar?: File

  @Column({ nullable: true })
  @Exclude()
  public avatarPath?: string

  @CreateDateColumn({ name: 'date_registration', select: false })
  public registrationDate: Date

  @Exclude()
  @Column('bytea', { select: false })
  public password: Buffer

  @Expose()
  public get avatarURL(): string | null {
    if (this.avatarPath) {
      const url = new URL(this.avatarPath, config.assetsURL)
      url.host = (new URL(config.imageURL)).host
      url.searchParams.append('max-h', '512')
      url.searchParams.append('max-w', '512')
      return url.href
    } else if (this.email) {
      const hash = createHash('md5').update(this.email.toLowerCase()).digest('hex')
      const url = new URL('avatar/' + hash, config.gravatarURL)
      return url.href
    } else {
      return 'https://static.cytoid.io/img/avatar.jpg'
    }
  }

  public setPassword(password: string) {
    return PasswordManager.hash(password)
      .then((passwordHash) => {
        this.password = passwordHash
        return passwordHash
      })
  }

  public checkPassword(password: string) {
    return PasswordManager.check(password, this.password)
  }

  public serialize(): IUser {
    return {
      email: this.email,
      id: this.id,
      name: this.name,
      uid: this.uid,
    }
  }
}

@Entity('emails')
export class Email {
  @PrimaryColumn()
  public address: string

  @Column()
  public verified: boolean

  @Type(() => User)
  @ManyToOne(() => User, (user) => user.id)
  public owner: User

  @Column()
  public ownerId: string
}
