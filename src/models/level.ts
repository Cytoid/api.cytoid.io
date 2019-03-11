import { Exclude, Type } from 'class-transformer'
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn, RelationId, Unique, UpdateDateColumn, VersionColumn,
} from 'typeorm'

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
  }
}

@Entity('levels')
export class Level {
  @PrimaryGeneratedColumn()
  public id: number

  @VersionColumn()
  public version: number

  @Column({ unique: true })
  public uid: string

  @Column()
  public title: string

  @Column('jsonb')
  public metadata: LevelMeta.IMeta

  @Column('decimal', { precision: 6, scale: 2 })
  public duration: number

  @Column('text')
  public description: string

  @Column({ default: false })
  public published: boolean

  @Column('varchar', { array: true, length: 30 })
  public tags: string[]

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
  public packageId?: number

  @Type(() => File)
  @ManyToOne(() => File, { onDelete: 'SET NULL', nullable: true })
  public package?: File

  @Type(() => File)
  @ManyToOne(() => File, { onDelete: 'SET NULL', nullable: true })
  public bundle?: ILevelBundle

  @Type(() => Chart)
  @OneToMany(() => Chart, (chart) => chart.level)
  public charts: Chart[]
  constructor() {
    this.version = 1
    this.title = ''
    this.metadata = {}
    this.duration = 0
    this.description = ''
    this.tags = []
  }
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
  public level?: Level
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
