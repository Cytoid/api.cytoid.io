import {
  Column,
  Entity, ObjectIdColumn,
  ObjectID,
} from 'typeorm'
import User from './user'

export class Comment {
  public content: string
  public creationDate: Date
  public owner?: User
  public disqusUser?: {
    name: string,
    username: string,
  }
  public comments: [Comment]
}

@Entity('threads')
export default class Thread {
  @ObjectIdColumn()
  public id: ObjectID

  @Column()
  public category: string

  @Column()
  public key: string

  @Column()
  public comments: [Comment]
}
