import axios, {AxiosInstance, AxiosResponse} from 'axios'
import config from '../conf'
import { IUser } from '../models/user'
export interface IClient {
  email: string
  name: string
}

export interface ITransport {
  sender: IClient
  replyTo?: IClient
  sendWithRemoteTemplate(templateID: string, target: IClient, data: any): Promise<any>
}

export class Sendgrid implements ITransport {
  public static client: AxiosInstance = axios.create({
    baseURL: 'https://api.sendgrid.com/v3',
    headers: {
      Authorization: 'Bearer ' + config.email.secretKey,
    },
  })

  public sender: IClient
  public replyTo?: IClient

  constructor(sender: IClient = config.email.sender, replyTo: IClient = config.email.replyTo) {
    this.sender = sender
    this.replyTo = replyTo
  }

  public sendWithRemoteTemplate(templateID: string, target: IUser | IClient, data: any): Promise<AxiosResponse> {
    data.email = target.email
    if (!target.name && (target as IUser).uid) {
      data.name = (target as IUser).uid
    } else {
      data.name = target.name
    }
    const postData: any = {
      personalizations: [
        {
          to: [ target ],
          dynamic_template_data: data,
        },
      ],
      from: this.sender,
      template_id: config.email.templates[templateID],
    }
    if (this.replyTo) {
      postData.reply_to = this.replyTo
    }
    return Sendgrid.client.post('/mail/send', postData)
  }
}

export class DebugTransport implements ITransport {
  public sender: IClient
  public replyTo?: IClient

  constructor(sender: IClient = config.email.sender, replyTo: IClient = config.email.replyTo) {
    this.sender = sender
    this.replyTo = replyTo
  }

  public sendWithRemoteTemplate(templateID: string, target: IClient, data: any): Promise<void> {
    console.log('Sent template email', config.email.templates[templateID], target, data)
    return Promise.resolve()
  }
}

const ClientClass = process.env.NODE_ENV === 'production' ? Sendgrid : DebugTransport

const client: ITransport = new ClientClass()
export default client
