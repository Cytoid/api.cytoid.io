import {Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn} from 'typeorm'
import User from './user'

@Entity('leaderboard')
export default class LeaderboardEntry {
  @PrimaryColumn()
  public id: string

  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'id' })
  public owner?: User

  @Column()
  public rating: number
}
