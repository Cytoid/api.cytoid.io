import 'reflect-metadata' // this shim is required
import { useKoaServer } from 'routing-controllers'

import logger from './logger'
import conf from './conf'
import './db'

import * as controllers from './controllers'
import * as middlewares from './middlewares'

import * as Koa from 'koa'
const app = new Koa()

import * as bodyParser from 'koa-bodyparser'
app.use(bodyParser())

import passport, {authorizationChecker, currentUserChecker} from './authentication'
app.use(passport.initialize())

app.keys = [conf.secret]

import * as session from 'koa-session'
app.use(session({
  key: 'cytoid:sess', /** (string) cookie key (default is koa:sess) */
  /** (number || 'session') maxAge in ms (default is 1 days) */
  /** 'session' will result in a cookie that expires when session/browser is closed */
  /** Warning: If a session cookie is stolen, this cookie will never expire */
  maxAge: 86400000,
  overwrite: true, /** (boolean) can overwrite or not (default true) */
  httpOnly: true, /** (boolean) httpOnly or not (default true) */
  signed: true, /** (boolean) signed or not (default true) */
  rolling: false, /** (boolean) Force a session identifier cookie to be set on every response. The expiration is reset to the original maxAge, resetting the expiration countdown. (default is false) */
  renew: false, /** (boolean) renew session when session is nearly expired, so we can always keep user logged in. (default is false)*/
}, app))

useKoaServer(app, {
  controllers: Object.values(controllers),
  middlewares: Object.values(middlewares),
  authorizationChecker,
  currentUserChecker,
  cors: {
    origin: conf.webURL,
    credentials: true,
  }
})

import * as morgan from 'koa-morgan'

// @ts-ignore
app.use(morgan('combined', {
  stream: {
    write (message: string) {
      logger.debug(message)
    }
  }
}))

export default app
