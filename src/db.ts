import 'reflect-metadata'
import { createConnection } from 'typeorm'
import {promisify} from 'util'
import registerDBTypes from './db-types'

import conf from './conf'

import * as models from './models'
import * as mongoModels from './models/mongo'

export const database = createConnection({
  name: 'default',
  ...conf.postgres,
  entities: Object.values(models),
  logging: process.env.NODE_ENV === 'production' ? ['info'] : true,
})
export const mongo = createConnection({
  name: 'data',
  type: 'mongodb',
  url: conf.mongo,
  useUnifiedTopology: true,
  entities: Object.values(mongoModels),
})

import {createClient, RedisClient, RedisError} from 'redis'
import logger from './logger'

export const redis: IAsyncRedisClient = createClient(conf.get('redis')) as IAsyncRedisClient

redis.getAsync = promisify(redis.get)
redis.setexAsync = promisify(redis.setex)
redis.delAsync = promisify(redis.del)
redis.setAsync = promisify(redis.set)

export interface IAsyncRedisClient extends RedisClient {
  getAsync(key: string): Promise<string>
  setexAsync(key: string, seconds: number, value: string): Promise<string>
  setAsync(key: string, value: string): Promise<string>
  delAsync(key: string): Promise<number>
}

export const connectDatabase = Promise.all([database, mongo])
  .then(async ([db, mongodb]) => {
    logger.info('Connected to databases')
    return registerDBTypes(db)
  })
  .catch((error) => {
    logger.error({
      message: 'PostgreSQL connection failed',
      details: error,
    })
    return Promise.reject(error)
  })

export const connectRedis = new Promise((resolve, reject) => {
  redis.on('ready', () => {
    logger.info('redis is ready')
    resolve()
  })
  redis.on('error', (err: RedisError) => {
    logger.error({
      message: 'redis connection failed',
      details: err,
    })
    reject(err)
  })
})
redis.on('connect', () => {
  logger.info('Redis was connected')
})
redis.on('reconnecting', () => {
  logger.info('redis is trying to reconnect...')
})
redis.on('end', () => {
  logger.info('redis connected was closed')
})
