import {Exclude} from 'class-transformer'
import { join as joinPath } from 'path'
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm'
import { resolve as resolveURL } from 'url'

import conf from '../conf'
import User from './user'

export interface IDirectory {
  [key: string]: string
}

@Entity('files')
export default class File {

  @PrimaryColumn()
  public path: string

  @Column()
  public type: string

  @Column('jsonb', { nullable: true, comment: 'null for standalone files' })
  public content?: IDirectory

  @Exclude()
  @Column({nullable: true})
  public ownerId?: string

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public owner?: User

  @Exclude()
  @CreateDateColumn({name: 'date_created'})
  public creationDate: Date

  public constructor(path: string, type: string) {
    this.path = path
    this.type = type
  }

  public toPlain(baseURL?: string): string | IDirectory {
    if (!baseURL) { baseURL = conf.assetsURL }
    if (!this.content) {
      // The file is not a directory
      return baseURL + this.path
    }
    const returningVal: IDirectory = {}
    for (const key of Object.keys(this.content)) {
      const completePath = joinPath(this.path, this.content[key])
      returningVal[key] = resolveURL(baseURL, completePath)
    }
    return returningVal
  }
}
