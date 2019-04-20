import { Exclude } from 'class-transformer'
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm'
import MailTransport, {ITransport as IMailTransport} from '../utils/mail'
import PasswordManager from '../utils/password'
export const passwordManager = new PasswordManager()

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

  @Column({ unique: true, nullable: true })
  public email?: string

  @Column({ name: 'email_verified', nullable: true })
  public emailVerified?: boolean

  @Column({ nullable: true })
  public birthday?: Date

  @CreateDateColumn({ name: 'date_registration' })
  public registrationDate: Date

  @Exclude()
  @Column('bytea')
  public password: Buffer

  public setPassword(password: string) {
    return passwordManager.hashPassword(password)
      .then((passwordHash) => {
        this.password = passwordHash
        return passwordHash
      })
  }
  public checkPassword(password: string) {
    return PasswordManager.checkPassword(this.password, password)
  }

  public serialize(): IUser {
    return {
      email: this.email,
      id: this.id,
      name: this.name,
      uid: this.uid,
    }
  }

  get mailClient(): IMailTransport | null {
    if (!this.email) {
      return null
    }
    const mailClient = new MailTransport()
    mailClient.recipient = {
      email: this.email,
      name: this.name,
    }
    mailClient.sharedData = {
      name: this.name,
    }
    return mailClient
  }
}
