import {
  Column, CreateDateColumn,
  Entity, ObjectIdColumn, UpdateDateColumn,
  ObjectID,
} from 'typeorm'

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
  public brief: string

  @Column()
  public description: string

  @Column()
  public ownerId: string

  @CreateDateColumn()
  public creationDate: Date

  @UpdateDateColumn()
  public modificationDate: Date

  @Column()
  public levelIds: [number]

  @Column()
  public tags: [string]

  @Column()
  public state: string

  @Column()
  public metadata: any
}
