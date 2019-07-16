import app from './app'
import conf from './conf'
import logger from './logger'

const port: number = conf.get('port')
const host: string = conf.get('host')
import {createServer} from 'http2'
import { connectDatabase, connectRedis } from './db'

function start() {
  return new Promise((resolve, reject) => {
    if (process.env.HTTP2) {
      createServer(app.callback())
        .listen(port, () => {
          logger.debug('HTTP2 Listening on port: ' + port)
          resolve()
        })
    } else {
      app.listen(port, () => {
        logger.debug('HTTP1.1 Listening on port: ' + port)
        resolve()
      })
    }
  })
}

Promise.all([connectDatabase, connectRedis]).then(start)
