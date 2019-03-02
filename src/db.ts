import 'reflect-metadata'
import { createConnection } from 'typeorm'

import conf from './conf'

import * as models from './models'

export const database = createConnection({
  ...conf.postgres,
  entities: Object.values(models),
  logging: true,
})

import {createClient, RedisError} from 'redis'
import logger from './logger'

export const redis = createClient(conf.get('redis'))

database
  .then(() => {
    logger.info('connected to postgresql')
  })
  .catch(error => {
    logger.error({
      message: 'PostgreSQL connection failed',
      details: error
    })
  })
redis.on('error', (err: RedisError) => {
  logger.error({
    message: 'redis connection failed',
    details: err
  })
})
redis.on('connect', () => {
  logger.info('redis was connected')
})
redis.on('reconnecting', () => {
  logger.info('redis is trying to reconnect...')
})
redis.on('ready', () => {
  logger.info('redis is ready')
})
redis.on('end', () => {
  logger.info('redis connected was closed')
})
