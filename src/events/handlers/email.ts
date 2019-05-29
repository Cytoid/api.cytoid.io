import * as EventEmitter from 'events'
import {IUser} from '../../models/user'

export function SendWelcomeEmail(user: IUser) {

}
export default function(emitter: EventEmitter) {
  emitter.on('user_new', (user: IUser) => {

  })
}
