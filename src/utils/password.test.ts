import {BinaryLike, randomBytes as randomCallback, scrypt as scryptCallback} from 'crypto'
import { promisify } from 'util'
import ScryptPassword, { IScryptOptions } from './password'
const randomBytes = promisify(randomCallback)

const scrypt: (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: IScryptOptions,
) => Promise<Buffer> = promisify(scryptCallback)

function genRandomString() {
  return randomBytes(32)
    .then((buffer) => buffer.toString('base64'))
}

describe('Password Generation and checks', () => {
  const pw = new ScryptPassword()
  it('Hashes a password and passes it', async () => {
    expect.assertions(3)
    const password = await genRandomString()
    const buffer = await pw.hashPassword(password)
    const options = pw.options

    // The password was generated
    expect(buffer).toBeTruthy()

    // The password has the expected length
    expect(buffer.length).toBe(options.saltLength + options.length + ScryptPassword.optionsLength)

    // The generated password passes the checks
    expect(await ScryptPassword.checkPassword(buffer, password)).toBeTruthy()
  })
  it('Does not pass faulty passwords', async () => {
    expect.assertions(1)
    const password1 =  await genRandomString()
    const password2 =  await genRandomString()
    const hash = await pw.hashPassword(password1)

    // The generated password passes the checks
    expect(await ScryptPassword.checkPassword(hash, password2)).not.toBeTruthy()
  })
  it('Stays compatible with different configurations', async () => {
    expect.assertions(3)
    const password = await genRandomString()
    const config: IScryptOptions = {
      blockSize: 8,
      cost: 16384 / 2,
      length: 68,
      parallelization: 1,
      saltLength: 16,
    }
    const npw = new ScryptPassword(config)
    const hash = await npw.hashPassword(password)
    // The password was generated
    expect(hash).toBeTruthy()

    // The password has the expected length
    expect(hash.length).toBe(config.saltLength + config.length + ScryptPassword.optionsLength)

    config.cost *= 2
    config.length *= 2
    config.saltLength *= 2

    // The generated password passes the checks after options changes
    expect(await ScryptPassword.checkPassword(hash, password)).toBeTruthy()
  })
})
