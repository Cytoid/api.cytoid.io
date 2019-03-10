import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import {Exclude} from 'class-transformer'
import { resolve as resolveURL } from 'url'
import { join as joinPath } from 'path'

import User from './user'
import conf from '../conf'

export interface IDirectory {
  [key: string]: string
}

@Entity('files')
export default class File {
  public constructor(path: string) {
    this.path = path
  }
  @PrimaryGeneratedColumn()
  public id: number

  @Column({unique: true})
  public path: string

  @Column('jsonb', { nullable: true, comment: 'null for standalone files' })
  public content?: IDirectory

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public owner?: User

  @Exclude()
  @CreateDateColumn({name: 'date_created'})
  public creationDate: Date

  @Column({default: false})
  public created: boolean

  public toPlain(baseURL?: string): string | IDirectory {
    if (!baseURL) baseURL = conf.assetsURL
    if (!this.content) {
      // The file is not a directory
      return baseURL + this.path
    }
    const returningVal: IDirectory = {}
    for (const key in this.content) {
      const completePath = joinPath(this.path, this.content[key])
      returningVal[key] = resolveURL(baseURL, completePath)
    }
    return returningVal
  }
}
