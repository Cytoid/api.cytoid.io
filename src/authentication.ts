import {classToPlain, plainToClass} from 'class-transformer'
import {randomBytes} from 'crypto'
import * as jwt from 'jsonwebtoken'
import {Context, Middleware, ParameterizedContext} from 'koa'
import * as Koa from 'koa'
import * as passport from 'koa-passport'
import {IRouterParamContext} from 'koa-router'
import * as Router from 'koa-router'
import {Profile as PassportProfile, Strategy, StrategyCreatedStatic} from 'passport'
import { Strategy as DiscordStrategy } from 'passport-discord'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import { Strategy as GoogleStrategy } from 'passport-google-oauth2'
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt'
import {IVerifyOptions, Strategy as LocalStrategy} from 'passport-local'
import { Action, NotFoundError } from 'routing-controllers'
import {getManager} from 'typeorm'
import {PasswordValidity} from 'unihash'
import conf from './conf'
import {redis} from './db'
import eventEmitter from './events'
import User, {ExternalAccount, IUser} from './models/user'

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

function checkExternalAccount(provider: string) {
  return (
    accessToken: string,
    refreshToken: string,
    profile: PassportProfile,
    callback: (error: any, user?: any, info?: any) => void) => {
    const newProfile: IProfile = {
      ...profile,
      token: refreshToken,
    }
    db
      .createQueryBuilder()
      .update(ExternalAccount)
      .set({ token: refreshToken })
      .where('uid=:id AND provider=:provider', { id: profile.id, provider })
      .returning('"ownerId"')
      .execute()
      .then((result) => result.raw[0] ? result.raw[0].ownerId : null)
      .then((userId) => {
        if (!userId) {
          return null
        } else {
          return db.createQueryBuilder(User, 'u')
            .select(['u.id', 'u.uid', 'u.name', 'u.email', 'u.avatarPath'])
            .where('u.id=:id', { id: userId })
            .getOne()
        }
      })
      .then((user) => callback(null, user, newProfile))
      .catch((error) => callback(error, newProfile))
  }
}

passport.use(new FacebookStrategy({
    clientID: conf.providers.facebook.client,
    clientSecret: conf.providers.facebook.secret,
    callbackURL: conf.apiURL + '/session/external/facebook',
    profileFields: ['id', 'birthday', 'email'],
  },
  checkExternalAccount('facebook'),
))

passport.use(new GoogleStrategy({
    clientID: conf.providers.google.client,
    clientSecret: conf.providers.google.secret,
    callbackURL: conf.apiURL + '/session/external/google',
  },
  checkExternalAccount('google'),
))

passport.use(new DiscordStrategy({
    clientID: conf.providers.discord.client,
    clientSecret: conf.providers.discord.secret,
    callbackURL: conf.apiURL + '/session/external/discord',
  },
  checkExternalAccount('discord'),
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

async function verifyUsernamePassword(
  this: StrategyCreatedStatic,
  username: string,
  password: string,
  done: (error: any, user?: any, options?: IVerifyOptions) => void) {
  username = username.toLowerCase()
  const user = await db.findOne(User, {
    where: [
      {uid: username},
      {email: username},
    ],
    select: ['id', 'uid', 'name', 'email', 'avatarPath', 'password'],
  })
  if (!user) { this.fail(null, 404) }
  const passwordVerified = await user.checkPassword(password)
  if (passwordVerified === PasswordValidity.Invalid) { return done(null, false) }
  if (passwordVerified === PasswordValidity.ValidOutdated) {
    user.setPassword(password)
      .then(() => db.save(user, {transaction: false}))
  }
  return done(null, user)
}

passport.use(
  new LocalStrategy(verifyUsernamePassword),
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

const passportSession = passport.session()
const authorizationCheckers: Koa.Middleware[] = [
  passportSession,
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

interface IExternalCreateAccountSession {
  id: string,
  token: string,
  email: string,
  avatar: string,
  language: string,
  provider: string
}
interface IProfile extends PassportProfile {
  token: string,
  email?: string,
  language?: string,
  locale?: string,
}
function postExternalAuth(ctx: ParameterizedContext<any, IRouterParamContext<any, {}>>, next: () => void) {
  return async (err: Error, user: User, info: IProfile) => {
    if (err) {
      ctx.throw(400, err.message)
    }
    if (user) {
      ctx.body = messageify({ user: classToPlain(user), provider: info.provider })
      await ctx.login(user)
    } else {
      const sessionData: IExternalCreateAccountSession = {
        id: info.id,
        token: info.token,
        email: info.email || (info.emails.length > 0 ? info.emails[0].value : null),
        avatar: info.photos ? (info.photos.length > 0 ? info.photos[0].value : null) : null,
        language: info.language || info.locale,
        provider: info.provider,
      }
      const key = await randomBytes(10)
      const encodedKey = key.toString('base64').replace(/[/+=]/g, '')
      await redis.setexAsync(
        'external_session:' + info.provider + ':' + encodedKey,
        3600,
        JSON.stringify(sessionData),
      )
      ctx.body = messageify({ token: encodedKey, provider: info.provider })
      ctx.status = 401
    }
  }
}

export async function getExternalProviderSession(
  token: string,
  provider: string): Promise<IExternalCreateAccountSession> {
  const key = 'external_session:' + provider + ':' + token
  const data = await redis.getAsync(key)
  if (!data) {
    return null
  }
  await redis.delAsync(key)
  return JSON.parse(data)
}

function messageify(obj: any) {
  return `\
<!doctype html>
<html>
<head>
</head>
<body>
<p>Authentication completed, you may close the window now.</p>
<script>
(function(){
  if (!window.opener) return;
  window.opener.postMessage(${JSON.stringify(obj)}, '*');
  window.close();
})()
</script>
</body>
</html>
`
}
export function useExternalAuth(app: Koa) {
  const router = new Router({
    prefix: '/session/external',
  })
  router
    .use(passportSession)
    .get('/facebook', (ctx, next) => {
      return passport.authenticate('facebook', { scope: ['email'] }, postExternalAuth(ctx, next))(ctx, next)
    })
    .get('/discord', (ctx, next) => {
      return passport.authenticate('discord', { scope: ['email', 'identify'] }, postExternalAuth(ctx, next))(ctx, next)
    })
    .get('/google', (ctx, next) => {
      return passport.authenticate('google', { scope: ['email', 'profile'] }, postExternalAuth(ctx, next))(ctx, next)
    })
  app
    .use(router.routes())
    .use(router.allowedMethods())
}
