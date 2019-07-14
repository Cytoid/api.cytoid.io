import { createHmac } from 'crypto'
import conf from '../conf'

export default function signURL(host: string, path: string, ttl: number) {
  const timestamp = Math.round(Date.now() + ttl * 1000)

  const url = new URL(path, host)

  const hash = createHmac('sha256', conf.cdnKey)
    .update(url.pathname + '-' + timestamp)
    .digest('base64')

  url.searchParams.append('token', hash)
  url.searchParams.append('expire', timestamp.toString())
  return url.href
}
