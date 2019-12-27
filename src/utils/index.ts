import { randomBytes } from 'crypto'
import { promisify } from 'util'

export const randomBytesAsync = promisify(randomBytes)
