import {BinaryLike, randomBytes as randomCallback, scrypt as scryptCallback} from 'crypto'
import { promisify } from 'util'
const randomBytes = promisify(randomCallback)

const scrypt: (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: IScryptOptions,
) => Promise<Buffer> = promisify(scryptCallback)

export interface IScryptOptions {
  cost: number
  blockSize: number
  length: number
  parallelization: number
  saltLength: number
}

export default class ScryptPassword {
  public static readonly optionsLength = 10
  public static async checkPassword(hash: Buffer, password: string): Promise<boolean> {
    const optionsLength = this.optionsLength
    const options: IScryptOptions  = {
      blockSize: hash.readUInt8(4),
      cost: hash.readUInt32LE(0),
      length: hash.readUInt16LE(8),
      parallelization: hash.readUInt8(5),
      saltLength: hash.readUInt16LE(6),
    }
    const hashSliceSalt = hash.slice(optionsLength, options.saltLength + optionsLength)
    const hashSlicePassword = hash.slice(options.saltLength + optionsLength)
    const realHash = await scrypt(password, hashSliceSalt, options.length, options)
    return realHash.equals(hashSlicePassword)
  }
  public readonly options: IScryptOptions = {
    blockSize: 8,
    cost: 16384,
    length: 128,
    parallelization: 1,
    saltLength: 32,
  }
  public constructor(options: IScryptOptions = null) {
    if (options) {
      this.options = options
    }
  }

  public async hashPassword(password: string): Promise<Buffer> {
    const optionsBuffer = this.generateOptionsBuffer()
    const salt = await randomBytes(this.options.saltLength)
    const saltedPassword = await scrypt(password, salt, this.options.length, this.options)
    return Buffer.concat([optionsBuffer, salt, saltedPassword])
  }
  private generateOptionsBuffer(): Buffer {
    const options = this.options
    return Buffer.concat([
      Buffer.from(Uint32Array.from([options.cost]).buffer),
      Buffer.from(Uint8Array.from([options.blockSize]).buffer),
      Buffer.from(Uint8Array.from([options.parallelization]).buffer),
      Buffer.from(Uint16Array.from([options.saltLength]).buffer),
      Buffer.from(Uint16Array.from([options.length]).buffer),
    ])
  }
}
