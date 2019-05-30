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
  jwtSecret: string
  apiURL: string
  assetsURL: string
  webURL: string
  functionURL: string
  gravatarURL: string

  email: {
    secretKey: string,
    sender: IEmailClient,
    replyTo: IEmailClient,
    templates: {
      [key: string]: string,
    },
  },
  captchaKey: string,
}

const conf: IAppConfiguration = require('config')
export default conf
