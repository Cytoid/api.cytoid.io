import {plainToClass} from 'class-transformer'
import * as jwt from 'jsonwebtoken'
import * as Koa from 'koa'
import * as passport from 'koa-passport'
import * as Router from 'koa-router'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import {ExtractJwt, Strategy as JwtStrategy} from 'passport-jwt'
import {Strategy as LocalStrategy} from 'passport-local'
import {Action} from 'routing-controllers'
import {getManager} from 'typeorm'
import {PasswordValidity} from 'unihash'
import conf from './conf'
import eventEmitter from './events'
import User, {IUser} from './models/user'

const db = getManager()
const JWTOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme('JWT'),
  secretOrKey: conf.jwtSecret,
  issuer: 'cytoid.io',
  audience: 'cytoid.io',
}
passport.use(
  new JwtStrategy(JWTOptions, async (payload, done) => {
    return done(null, plainToClass(User, payload.sub))
  }),
)

passport.use(new FacebookStrategy({
    clientID: '329872044311027',
    clientSecret: 'ba062ce1ffb2a84a279e0c1e37a64004',
    callbackURL: conf.apiURL + '/session/external/facebook/callback',
  },
  (accessToken, refreshToken, profile, callback) => {
    console.log(profile)
    callback(false)
  },
))

export function signJWT(payload: any): Promise<string> {
  return new Promise((resolve, reject) => {
    jwt.sign({sub: payload}, JWTOptions.secretOrKey, {
      audience: JWTOptions.audience,
      issuer: JWTOptions.issuer,
      expiresIn: '365d',
    }, (err: Error, encoded: string) => {
      if (err) { reject(err) } else { resolve(encoded) }
    })
  })
}

passport.use(
  new LocalStrategy(async (username, password, done) => {
    username = username.toLowerCase()
    const user = await db.findOne(User, {
      where: [
        {uid: username},
        {email: username},
      ],
      select: ['id', 'uid', 'name', 'email', 'avatarPath', 'password'],
    })
    if (!user) { return done(null, false) }
    const passwordVerified = await user.checkPassword(password)
    if (passwordVerified === PasswordValidity.Invalid) { return done(null, false) }
    if (passwordVerified === PasswordValidity.ValidOutdated) {
      user.setPassword(password)
        .then(() => db.save(user, {transaction: false}))
    }
    return done(null, user)
  }),
)

passport.serializeUser((user: User, done) => {
  done(null, user.serialize())
})

passport.deserializeUser((id: IUser, done) => {
  eventEmitter.emit('user_activity', id)
  done(null, id)
})

export default passport

export async function currentUserChecker(action: Action): Promise<IUser> {
  return action.context.state.user
}

const authorizationCheckers: Koa.Middleware[] = [
  passport.session(),
  passport.authenticate('jwt', {session: false}),
]
export function authorizationChecker(action: Action, roles: string[]) {
  for (const authenticator of authorizationCheckers) {
    authenticator(action.context, () => Promise.resolve())
    if (action.context.state.user) {
      break
    }
  }
  return action.context.state.user
}

export function OptionalAuthenticate(context: any, next: (err?: Error) => Promise<any>) {
  for (const authenticator of authorizationCheckers) {
    authenticator(context, () => Promise.resolve())
    if (context.state.user) {
      break
    }
  }
  context.status = 200
  return next()
}

export function externalAuthentication(app: Koa) {
  const router = new Router({
    prefix: '/session/external',
  })
  router
    .get('/facebook', passport.authenticate('facebook'))
    .get(
      '/facebook/callback',
      passport.authenticate('facebook'),
      (ctx, next) => {
        console.log('asdfasdf')
      })
  app.use(router.routes()).use(router.allowedMethods())
}
