import { IConfig } from 'config'
import { ClientOpts } from 'redis'
import { ConnectionOptions } from 'typeorm/connection/ConnectionOptions'
import { IClient as IEmailClient } from './utils/mail'

interface IKeyPair {
  client: string,
  secret: string,
}
export interface IAppConfiguration extends IConfig {
  host: string
  port: number
  postgres: ConnectionOptions
  mongo: string
  redis: ClientOpts
  secret: string
  jwtSecret: string
  apiURL: string
  assetsURL: string
  imageURL: string
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
  tencentCaptchaKey: string,
  cdnKey: string,
  providers: {
    facebook: IKeyPair,
    discord: IKeyPair,
    google: IKeyPair,
  }
}

const conf: IAppConfiguration = require('config')
export default conf
