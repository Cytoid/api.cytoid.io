import { Exclude, Transform, Type } from 'class-transformer'
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn, RelationId, Unique, UpdateDateColumn, VersionColumn,
} from 'typeorm'

import ac from '../access'

import File, {IDirectory} from './file'
import User from './user'

export namespace LevelMeta {
  export interface ISource {
    name: string
    localized_name?: string
    url?: string
  }
  export interface IMeta {
    title?: string
    title_localized?: string
    artist?: ISource
    illustrator?: ISource
    charter?: ISource
    storyboarder?: ISource
    raw: any
  }
}

@Entity('levels')
export class Level {
  @PrimaryGeneratedColumn()
  public id: number

  @Column('integer')
  public version: number

  @Column({ unique: true })
  public uid: string

  @Column()
  public title: string

  @Column('jsonb')
  public metadata: LevelMeta.IMeta

  @Column('decimal', { precision: 6, scale: 2 })
  public duration: number

  @Column('int')
  public size: number

  @Column('text')
  public description: string

  /*
    True: Public
    False: Unlisted
    Null: private
   */
  @Column({ default: false, nullable: true })
  public published?: boolean

  @Column('varchar',  {nullable: true})
  public censored?: string

  @Column('citext', { array: true })
  public tags: string[]

  @Column('varchar', { array: true })
  public category: string[]

  @Exclude()
  @Column({nullable: true})
  public ownerId?: string

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public owner?: User

  @CreateDateColumn({ name: 'date_created' })
  public creationDate: Date

  @UpdateDateColumn({ name: 'date_modified' })
  public modificationDate: Date

  @Exclude()
  @Column({nullable: true})
  public packagePath?: string

  @Type(() => File)
  @ManyToOne(() => File, { onDelete: 'SET NULL', nullable: true })
  public package?: File

  @Type(() => File)
  @ManyToOne(() => File, { onDelete: 'SET NULL', nullable: true })
  @Transform((b) => File.prototype.toPlain.call(b), { toPlainOnly: true })
  public bundle?: ILevelBundle

  @Type(() => Chart)
  @OneToMany(() => Chart, (chart) => chart.level)
  public charts: Chart[]
}

export interface ILevelBundleDirectory extends IDirectory {
  music: string
  music_preview: string
  background: string
}

export interface ILevelBundle extends File {
  content: ILevelBundleDirectory
}

@Entity('charts')
@Unique(['type', 'level'])
export class Chart {
  @PrimaryGeneratedColumn()
  public id: number

  @Column({ nullable: true })
  public name: string

  @Column()
  public type: string

  @Column('smallint')
  public difficulty: number

  @ManyToOne(() => Level, (level) => level.charts, { onDelete: 'CASCADE', nullable: true })
  public level: Level

  @Column('integer')
  public levelId: number

  @Column({ nullable: false })
  public notesCount: number

  @Column({ nullable: false, select: false })
  @Exclude()
  public checksum: string

  @Column({ select: false })
  @Exclude()
  public hash: Buffer
}

@Entity ('level_ratings')
@Unique(['level', 'user'])
@Check('((rating <= 10 ) AND (rating > 0))')
export class Rating {
  @PrimaryGeneratedColumn()
  public id: number

  @Column()
  public levelId: number

  @ManyToOne(() => Level, { onDelete: 'CASCADE', nullable: false })
  public level: Level

  @Column()
  public userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  public user: User

  @Column('smallint')
  public rating: number
}

@Entity ('level_downloads')
@Unique(['level', 'user'])
export class Download {
  @PrimaryGeneratedColumn()
  public id: number

  @Column()
  public levelId: number

  @ManyToOne(() => Level, { onDelete: 'CASCADE', nullable: false })
  public level: Level

  @Column()
  public userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  public user: User

  @Column('timestamp')
  public date: Date

  @Column('smallint')
  public count: number
}

ac.grant('user')
    .createOwn('level')
    .deleteOwn('level')
    .readOwn('level')
    .updateOwn('level', ['title', 'description', 'tags', 'published'])
  .grant('moderator')
    .readAny('level')
    .updateAny('level', ['title', 'description', 'tags', 'category', 'censored', 'published'])
