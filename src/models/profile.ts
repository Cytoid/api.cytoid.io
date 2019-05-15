import {Column, Entity, PrimaryColumn, ManyToOne} from 'typeorm'
import {Type} from 'class-transformer'
import File from './file'

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
}
