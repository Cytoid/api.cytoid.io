import { IConfig } from 'config'
import { ConnectionOptions } from 'typeorm/connection/ConnectionOptions'
import { ClientOpts } from 'redis'
import { IClient as IEmailClient } from './utils/mail'

export interface IAppConfiguration extends IConfig {
  host: string
  port: number
  postgres: ConnectionOptions
  redis: ClientOpts
  secret: string
  apiURL: string
  assetsURL: string
  webURL: string
  functionURL: string
  gravatarURL: string

  emailSecretKey: string

  emailSender: IEmailClient
  emailReplyTo?: IEmailClient
  emailTemplates: {
    passwordReset: string,
  }
}

const conf: IAppConfiguration = require('config')
export default conf
