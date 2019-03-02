import 'reflect-metadata'
import { createConnection } from 'typeorm'

import conf from './conf'

import * as models from './models'

export const database = createConnection({
  ...conf.postgres,
  entities: Object.values(models),
  logging: true,
})


import { createClient, RedisError } from 'redis'

export const redis = createClient(conf.get('redis'))

redis.on('error', (err: RedisError) => {
  console.error(err)
})
redis.on('connect', () => {
  console.log('redis was connected')
})
redis.on('reconnecting', () => {
  console.warn('redis is trying to reconnect...')
})
redis.on('ready', () => {
  console.log('redis is ready to use')
})
redis.on('end', () => {
  console.log('redis connected was closed')
})
