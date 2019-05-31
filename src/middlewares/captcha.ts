import {Context} from 'koa'
import {BadRequestError, InternalServerError} from 'routing-controllers'
import axios from 'axios'
import conf from '../conf'
import config from '../conf'

export default function createCaptchaValidator(action: string) {
  function use(context: Context, next: (err?: any) => Promise<any>): Promise<any> {
    const token = context.request.body.token
    if (!token) {
      context.throw(400, 'Captcha token required!')
      return Promise.resolve()
    }
    return axios({
      url: 'https://www.google.com/recaptcha/api/siteverify',
      method: 'post',
      params: {
        response: token,
        secret: conf.captchaKey,
        // remoteip:
      },
      // @ts-ignore
      httpsAgent: new require('socks-proxy-agent')('socks5://localhost:1080'),
    })
      .then((res) => {
        context.assert(res.data.success, 500, 'captcha validation failed' + ('error-codes' in res.data) ?
          res.data['error-codes'] :
          'Unknown')
        context.assert(res.data.action === action, 400, 'action mismatch')
        context.assert(res.data.score >= 0.7, 400, 'you are a robot(' + res.data.score + ')')
        return next()
      })
  }
  return use
}
