import * as jwt from 'jsonwebtoken'
import {Middleware} from 'koa'
import * as passport from 'koa-passport'
import {ExtractJwt, Strategy as JwtStrategy} from 'passport-jwt'
import {Strategy as LocalStrategy} from 'passport-local'
import {Action} from 'routing-controllers'
import {getManager} from 'typeorm'
import {PasswordValidity} from 'unihash'
import conf from './conf'
import User, {IUser} from './models/user'
import eventEmitter from './events'

const db = getManager()
const JWTOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: conf.jwtSecret,
  issuer: 'cytoid.io',
  audience: 'cytoid.io',
}
passport.use(
  new JwtStrategy(JWTOptions, async (jwt_payload, done) => {
    return done(null, jwt_payload.sub)
  }),
)
export function signJWT(payload: any): Promise<string> {
  return new Promise((resolve, reject) => {
    jwt.sign({sub: payload}, JWTOptions.secretOrKey, {
      audience: JWTOptions.audience,
      issuer: JWTOptions.issuer,
      expiresIn: '10d',
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

const authorizationCheckers: Middleware[] = [
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
