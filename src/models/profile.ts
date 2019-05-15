import {Type} from 'class-transformer'
import {
  Column,
  Entity,
  JoinColumn, ManyToOne,
  OneToOne, PrimaryColumn} from 'typeorm'
import File from './file'
import User from './user'

@Entity('profiles')
export default class Profile {
  @PrimaryColumn()
  public id: string

  @Column('date')
  public birthday: Date

  @Type(() => File)
  @ManyToOne(() => File)
  public header: File

  @Column()
  public bio: string

  @Column('varchar', { array: true })
  public badges: string[]

  @OneToOne(() => User)
  @JoinColumn({ name: 'id' })
  public user: User
}
