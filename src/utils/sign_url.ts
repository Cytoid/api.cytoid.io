import { createHash } from 'crypto'
import conf from '../conf'

export default class URLSigner {
  public secretField: string = 'secret'
  public ttlField: string = 'ttl'
  public tokenField: string = 'token'
  public secret: string = conf.cdnKey
  public signURL(host: string, path: string, ttl?: number) {
    const timestamp = Math.round((new Date()).getTime() / 1000 + ttl)
    const params = new URLSearchParams()
    if (ttl) {
      params.append(this.ttlField, timestamp.toString())
    }
    params.append(this.secretField, this.secret)

    const secretPath = '/' + path + '?' + params.toString()

    const hash = createHash('md5').update(secretPath).digest('hex')

    const url = new URL(path, host)
    url.searchParams.append(this.tokenField, hash)
    url.searchParams.append(this.ttlField, timestamp.toString())
    return url.toString()
  }
}
