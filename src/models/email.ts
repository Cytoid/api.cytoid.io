import { Type } from 'class-transformer'
import {Column, Entity, ManyToOne, PrimaryColumn} from 'typeorm'
import User from './user'

@Entity('emails')
export default class Email {
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
