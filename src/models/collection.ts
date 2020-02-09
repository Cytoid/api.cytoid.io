import {
  Column, CreateDateColumn,
  Entity, ObjectID, ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'
import ac from '../access'

@Entity('collections')
export default class Collection {
  @ObjectIdColumn()
  public id: ObjectID

  @Column()
  public uid: string

  @Column()
  public coverPath: string

  @Column()
  public title: string

  @Column()
  public slogan: string

  @Column()
  public description: string

  @Column()
  public ownerId: string

  @CreateDateColumn()
  public creationDate: Date

  @UpdateDateColumn()
  public modificationDate: Date

  @Column()
  public levelIds: number[]

  @Column()
  public tags: string[]

  @Column()
  public state: string

  @Column()
  public metadata: any
}

ac.grant('user')
  .createOwn('collection')
  .deleteOwn('collection')
  .readOwn('collection')
  .updateOwn('collection', ['uid', 'coverPath', 'title', 'slogan', 'description', 'levelIds', 'tags', 'state', 'metadata'])
  .grant('moderator')
  .readAny('collection')
  .updateAny('collection')
