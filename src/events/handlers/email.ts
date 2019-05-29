import * as EventEmitter from 'events'
import {IUser} from '../../models/user'
import emailClient, {IClient} from '../../utils/mail'

export function SendWelcomeEmail(user: IUser){
  if (user.email) {
    const client: IClient = {
      name: user.name || user.uid,
      email: user.email,
    }
    emailClient.sendWithRemoteTemplate('welcome', client, {

    })
  }

}
export default function(emitter: EventEmitter) {
  emitter.on('user_new', SendWelcomeEmail)
}
