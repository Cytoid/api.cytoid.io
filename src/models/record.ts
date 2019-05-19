import {Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn} from 'typeorm'
import {IsInt, Min} from 'class-validator'
import {Exclude} from 'class-transformer'
import { Chart } from './level'
import User from './user'

export class RecordDetails {
  @IsInt()
  @Min(0)
  perfect: number

  @IsInt()
  @Min(0)
  great: number

  @IsInt()
  @Min(0)
  good: number

  @IsInt()
  @Min(0)
  bad: number

  @IsInt()
  @Min(0)
  miss: number

  @IsInt()
  @Min(0)
  max_combo: number
}

export enum GameplayMods {
  hyper = 'hyper',
  another = 'another',
  fullCombo = 'fullCombo',
  allPerfect = 'allPerfect',
  flipX = 'flipX',
  flipY = 'flipY',
  fast = 'fast',
  slow = 'slow',
  noScanline = 'noScanline',
  invisible = 'invisible',
}

@Entity('records')
export default class Record {
  @PrimaryGeneratedColumn()
  public id: number

  @CreateDateColumn()
  public date: Date

  @ManyToOne(() => Chart, { onDelete: 'CASCADE', nullable: false })
  public chart: Chart

  @Exclude()
  @Column()
  public ownerId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  public owner: User

  @Column('integer')
  public score: number

  @Column('real', { precision: 5, scale: 2 })
  public accuracy: number

  @Column('jsonb')
  public details: RecordDetails

  @Column('varchar', { array: true, length: 32})
  public mods: string[]

  @Column('boolean', { nullable: false })
  public ranked: boolean
}
