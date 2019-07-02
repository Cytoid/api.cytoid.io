import {Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn} from 'typeorm'
import User from './user'

@Entity('leaderboard')
export default class LeaderboardEntry {
  @PrimaryColumn()
  public ownerId: string

  @OneToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'ownerId' })
  public owner?: User

  @Column()
  public ranking: number

  @Column()
  public rating: number
}
