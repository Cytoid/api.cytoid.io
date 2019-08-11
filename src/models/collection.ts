import { Type, Exclude, Expose } from 'class-transformer'
import {
  Column, CreateDateColumn,
  Entity,
  JoinTable, ManyToMany,
  ManyToOne, PrimaryColumn, UpdateDateColumn,
} from 'typeorm'
import File from './file'
import { Level } from './level'
import User from './user'
import config from '../conf'

@Entity('collections')
export default class Collection {
  @PrimaryColumn()
  public id: number

  @Column()
  public uid: string

  @Type(() => File)
  @ManyToOne(() => File)
  public cover: File

  @Column()
  @Exclude()
  public coverPath: string

  @Expose()
  public get coverURL(): string {
    if (!this.coverPath) {
      return undefined
    }
    return config.assetsURL + '/' + this.coverPath
  }

  @Column()
  public title: string

  @Column()
  public brief: string

  @Column()
  public description: string

  @Column()
  @Exclude()
  public ownerId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  public owner: User

  @CreateDateColumn({ name: 'date_created' })
  public creationDate: Date

  @UpdateDateColumn({ name: 'date_modified' })
  public modificationDate: Date

  @ManyToMany((type) => Level)
  @JoinTable({
    name: 'collections_levels',
    joinColumn: {
      name: 'collectionId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'levelId',
      referencedColumnName: 'id',
    },
  })
  public levels: Level[]
}
