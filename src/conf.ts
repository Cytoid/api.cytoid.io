import { IConfig } from 'config'
import { ConnectionOptions } from 'typeorm/connection/ConnectionOptions'
import { ClientOpts } from 'redis'

export interface AppConfiguration extends IConfig {
  host: string
  port: number
  postgres: ConnectionOptions
  redis: ClientOpts
  secret: string
  apiURL: string
  assetsURL: string
  webURL: string
}

const conf: AppConfiguration = require('config')
export default conf
