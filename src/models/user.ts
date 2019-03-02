import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity('users')
export default class User {
  @PrimaryGeneratedColumn('uuid')
  public id: string

  @Column({ unique: true, nullable: true })
  public uid?: string

  @Column()
  public name: string

  @Column('bytea')
  public password: Buffer

  @Column({ unique: true, nullable: true })
  public email?: string

  @Column({ name: 'email_verified', nullable: true })
  public emailVerified?: boolean

  @Column({ nullable: true })
  public birthday?: Date

  @CreateDateColumn({ name: 'date_registration' })
  public registrationDate: Date

  @Column({ name: 'date_last_active' })
  public lastActive: Date
}
