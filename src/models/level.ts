/* tslint:disable:max-classes-per-file */
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn, Unique, UpdateDateColumn, VersionColumn,
} from 'typeorm'

import File from './file'
import User from './user'

export interface ISource {
  name: string
  url: URL
}

export interface ILevelMeta {
  artist: ISource
  illustrator: ISource
  charter: ISource
  storyboarder: ISource
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
  public metadata: ILevelMeta

  @Column('decimal', { precision: 6, scale: 2 })
  public duration: number

  @Column('text')
  public description: string

  @Column({ default: false })
  public published: boolean

  @Column('varchar', { array: true, length: 30 })
  public tags: string[]

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public owner?: User

  @CreateDateColumn({ name: 'date_created' })
  public creationDate: Date

  @UpdateDateColumn({ name: 'date_modified' })
  public modificationDate: Date

  @ManyToOne(() => File, { onDelete: 'SET NULL', nullable: true })
  public package?: File

  @ManyToOne(() => File, { onDelete: 'SET NULL', nullable: true })
  public directory?: File

  @OneToMany(() => Chart, (chart) => chart.level)
  public charts: Chart[]
}

@Entity('charts')
export class Chart {
  @PrimaryGeneratedColumn()
  public id: number

  @Column()
  public title: string

  @Column('smallint')
  public difficulty: number

  @ManyToOne(() => Level, (level) => level.charts, { onDelete: 'CASCADE', nullable: true })
  public level?: Level
}

@Entity ('level_ratings')
@Unique(['level', 'user'])
@Check('((rating < 10 ) AND (rating >= 0))')
export class Rating {
  @PrimaryGeneratedColumn()
  public id: number

  @ManyToOne(() => Level, { onDelete: 'CASCADE', nullable: false })
  public level: Level

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  public user: User

  @Column('smallint')
  public rating: number
}
