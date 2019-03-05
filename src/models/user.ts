import { Exclude } from 'class-transformer'
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm'
import PasswordManager from '../utils/password'
const passwordManager = new PasswordManager()

@Entity('users')
export default class User {
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

  @Column({ name: 'date_last_active' })
  private lastActive: Date

  @Exclude()
  @Column('bytea')
  private password: Buffer

  public activates(): Date {
    this.lastActive = new Date()
    return this.lastActive
  }

  public setPassword(password: string) {
    return passwordManager.hashPassword(password)
      .then((passwordHash) => {
        this.password = passwordHash
        return passwordHash
      })
  }
}
