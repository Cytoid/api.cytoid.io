import * as passport from 'koa-passport'
import {Strategy as JwtStrategy, ExtractJwt} from 'passport-jwt'
import {Strategy as LocalStrategy} from 'passport-local'
import {getManager} from 'typeorm'
import User, {IUser} from './models/user'
import * as jwt from 'jsonwebtoken'

const db = getManager()
const JWTOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: 'secret',
  issuer: 'cytoid.io',
  audience: 'cytoid.io'
}
passport.use(
  new JwtStrategy(JWTOptions, async (jwt_payload, done) => {
    return done(null, jwt_payload.sub)
  })
)
export function signJWT(payload: any): Promise<string> {
  return new Promise((resolve, reject) => {
    jwt.sign({sub: payload}, JWTOptions.secretOrKey, {
      audience: JWTOptions.audience,
      issuer: JWTOptions.issuer,
      expiresIn: '10d',
    }, (err: Error, encoded: string) => {
      if (err) reject(err)
      else resolve(encoded)
    })
  })
}

passport.use(
  new LocalStrategy(async (username, password, done) => {
    const user = await db.findOne(User, {
      where: [
        {uid: username},
        {email: username}
      ]
    })
    if (!user) return done(null, false)
    const passwordVerified = await user.checkPassword(password)
    if (!passwordVerified) return done(null, false)
    return done(null, user)
  })
)

passport.serializeUser((user: User, done) => {
  done(null, user.serialize())
})

passport.deserializeUser((id: IUser, done) => {
  done(null, id)
})

export default passport

import { Action } from "routing-controllers"
import {Middleware} from 'koa'

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
    if (action.context.state.user)
      break
  }
  return action.context.state.user
}

export function OptionalAuthenticate(context: any, next: (err?: Error) => Promise<any>){
  for (const authenticator of authorizationCheckers) {
    authenticator(context, () => Promise.resolve())
    if (context.state.user)
      break
  }
  return next()
}
