import {Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn} from 'typeorm'

import { Chart } from './level'
import User from './user'

export interface IRecordDetails {
  perfect: number
  great: number
  good: number
  bad: number
}

export enum GameplayMods {
}

@Entity()
export default class Record {
  @PrimaryGeneratedColumn()
  public id: number

  @CreateDateColumn()
  public date: Date

  @ManyToOne(() => Chart, { onDelete: 'CASCADE', nullable: false })
  public chart: Chart

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  public owner: User

  @Column('integer')
  public score: number

  @Column('decimal', { precision: 5, scale: 2 })
  public accuracy: number

  @Column('jsonb')
  public details: IRecordDetails

  @Column('varchar', { array: true, length: 32})
  public mods: GameplayMods[]

  @Column('integer', { nullable: true, comment: 'Ranking when made the record. Null in unranked mode' })
  public ranking?: number
}
