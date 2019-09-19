import axios from 'axios'
import { classToPlain } from 'class-transformer'
import * as EventEmitter from 'events'
import { redis } from '../../db'
import { Level } from '../../models/level'

function getRedisKey(uid: string) {
  return 'cytoid:webhook:newlevel:' + uid
}

export function RegisterNewlyUploadedLevel(level: Level) {
  return redis.setexAsync(getRedisKey(level.uid), 3600, level.uid)
}

export async function LevelPublished(level: Level) {
  const key = getRedisKey(level.uid)
  const exists = await redis.getAsync(key)
  if (!exists) {
    return
  }
  await redis.delAsync(key)
  executeWebhook('new_level', level)
}
export default function(emitter: EventEmitter) {
  emitter.on('level_uploaded', RegisterNewlyUploadedLevel)
  emitter.on('level_published', LevelPublished)
}

export const WebHooks = {
  new_level: [
    'https://cytoidio-notifier-v4--yamboy1.repl.co/webhook',
  ],
}

export function executeWebhook(key: keyof typeof WebHooks, param: any) {
  const webhookList: string[] = WebHooks[key]
  for (const hook of webhookList) {
    axios.post(hook, classToPlain(param))
    console.log('Webhook called, ' + hook)
    console.log(param)
  }
}
