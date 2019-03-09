import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import {Exclude} from 'class-transformer'

import User from './user'

export interface IDirectory {

}

@Entity('files')
export default class File {
  @PrimaryGeneratedColumn()
  public id: number

  @Column()
  public url: string

  @Column('jsonb', { nullable: true, comment: 'null for standalone files' })
  public content?: IDirectory

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public owner?: User

  @Exclude()
  @CreateDateColumn({name: 'date_created'})
  public creationDate: Date

  @Column({default: false})
  public created: boolean
}
