import { randomBytes as randomCallback } from 'crypto'
import { promisify } from 'util'
import { redis } from '../db'
const randomBytes = promisify(randomCallback)

export class VerificationCodeManager {
  public name: string
  public keyLength: number
  public ttl: number

  public constructor(name: string) {
    this.name = name
    this.keyLength = 30
    this.ttl = 600
  }

  public async generate(credential: string) {
    const key = await randomBytes(this.keyLength)
    const encodedKey = key.toString('base64').replace(/\//g, '.')
    await redis.setexAsync(this.storeKey(encodedKey), this.ttl, credential)
    return encodedKey
  }

  public validate(key: string) {
    return redis.getAsync(this.storeKey(key))
  }

  public async makeInvalidate(key: string) {
    key = this.storeKey(key)
    const credential = await redis.getAsync(key)
    if (credential) {
      await redis.delAsync(key)
    }
    return credential
  }

  private storeKey(key: string) {
    return this.name + ':' + key
  }
}
