import conf from './conf'
import logger from './logger'
import app from './app'

const port: number = conf.get('port')
const host: string = conf.get('host')
import {createServer} from 'http2'

if (process.env['HTTP2']) {
  createServer(app.callback())
    .listen(port, (err: any) => {
      if (err) {
        throw new Error(err)
      }

      logger.debug('HTTP2 Listening on port: ' + port)
    })
} else {
  app.listen(3000, () => {
    logger.debug('HTTP1.1 Listening on port: ' + port)
  })
}
