import axios, {AxiosInstance, AxiosResponse} from 'axios'
import config from '../conf'
export interface IClient {
  email: string
  name: string
}

export interface ITransport {
  sender: IClient
  replyTo?: IClient
  sendWithRemoteTemplate(templateID: string, data: any, target?: IClient): Promise<void>
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
  public sharedData: any

  public recipient?: IClient

  constructor(sender: IClient = config.emailSender, replyTo: IClient = config.emailReplyTo) {
    this.sender = sender
    this.replyTo = replyTo
  }

  public sendWithRemoteTemplate(templateID: string, data: any, target: IClient = this.recipient): Promise<void> {
    if (this.sharedData) {
      Object.assign(data, this.sharedData)
    }
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
      .then((res) => {
        console.log(res.data)
      })
      .catch((error) => {
        console.log(error.response.data)
        throw error.response.data
      })
  }
}

export class DebugTransport implements ITransport {
  public sender: IClient
  public replyTo?: IClient
  public sharedData: any

  public recipient?: IClient

  constructor(sender: IClient = config.emailSender, replyTo: IClient = config.emailReplyTo) {
    this.sender = sender
    this.replyTo = replyTo
  }

  public sendWithRemoteTemplate(templateID: string, data: any, target: IClient = this.recipient): Promise<void> {
    if (this.sharedData) {
      Object.assign(data, this.sharedData)
    }
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
    console.log(data, postData)
    return Promise.resolve()
  }
}

export default DebugTransport
