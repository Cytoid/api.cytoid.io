import * as EventEmitter from 'events'
import { redis } from '../../db'
import { IUser } from '../../models/user'

export function RefreshOnlineStatus(user: IUser) {
  redis.setexAsync('onlinestatus:' + user.id, 1800, '')
}
export default function(emitter: EventEmitter) {
  emitter.on('user_activity', RefreshOnlineStatus)
}
