import axios, {AxiosInstance, AxiosResponse} from 'axios'
import config from '../conf'
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
      Authorization: 'Bearer ' + config.emailSecretKey,
    },
  })

  public sender: IClient
  public replyTo?: IClient

  constructor(sender: IClient = config.emailSender, replyTo: IClient = config.emailReplyTo) {
    this.sender = sender
    this.replyTo = replyTo
  }

  public sendWithRemoteTemplate(templateID: string, target: IClient, data: any): Promise<AxiosResponse> {
    const postData: any = {
      personalizations: [
        {
          to: [ target ],
          dynamic_template_data: data,
        },
      ],
      from: this.sender,
      template_id: templateID,
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

  constructor(sender: IClient = config.emailSender, replyTo: IClient = config.emailReplyTo) {
    this.sender = sender
    this.replyTo = replyTo
  }

  public sendWithRemoteTemplate(templateID: string, target: IClient, data: any): Promise<void> {
    console.log('Sent email', data)
    return Promise.resolve()
  }
}

const client = new DebugTransport()
export default client
