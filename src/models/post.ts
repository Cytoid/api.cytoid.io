import { Type } from 'class-transformer'
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'

import File from './file'
import User from './user'

interface IPostMeta {
  coverArtist: string
}

@Entity('posts')
export default class Post {
  @PrimaryGeneratedColumn('uuid')
  public id: string

  @Column({ unique: true, nullable: false })
  public slug: string

  @Column()
  public title: string

  @Column()
  public subtitle: string

  @Column('varchar', { array: true, length: 30 })
  public tags: string[]

  @CreateDateColumn({ name: 'date_created' })
  public creationDate: Date

  @Column('text')
  public content: string

  @Column('jsonb')
  public metadata: IPostMeta

  @Type(() => File)
  @ManyToOne(() => File, { onDelete: 'SET NULL', nullable: true })
  public header?: File

  @Column('headerPath')
  public headerPath?: string

  @Type(() => User)
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public owner?: User

  @Column({ name: 'ownerId', select: false })
  public ownerId?: string
}
