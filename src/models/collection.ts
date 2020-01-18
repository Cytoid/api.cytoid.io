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

  @CreateDateColumn({ name: 'date_created' })
  public creationDate: Date

  @UpdateDateColumn({ name: 'date_modified' })
  public modificationDate: Date

  @Column()
  public levelIds: [number]
}
