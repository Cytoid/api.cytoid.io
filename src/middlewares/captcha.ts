import {Context} from 'koa'
import {BadRequestError, InternalServerError} from 'routing-controllers'
import axios from 'axios'
import conf from '../conf'
import config from '../conf'

export default function createCaptchaValidator(action: string) {
  function use(context: Context, next: (err?: any) => Promise<any>): Promise<any> {
    const token = context.request.body.token
    if (!token) {
      throw new BadRequestError('captcha token required')
    }
    return axios({
      url: 'https://www.google.com/recaptcha/api/siteverify',
      method: 'post',
      params: {
        response: token,
        secret: conf.captchaKey,
        // remoteip:
      },
    })
      .then((res) => {
        if (!res.data.success) {
          context.response.body = 'captcha validation failed: '
          if ('error-codes' in res.data) {
            context.response.body += res.data['error-codes']
          } else {
            context.response.body += 'Unknown'
          }
          context.response.status = 500
          return Promise.resolve()
        } else if (res.data.action !== action) {
          context.response.body = 'action mismatch'
          context.response.status = 400
          return Promise.resolve()
        } else if (res.data.score <= 0.7) {
          context.response.body = 'you are a robot(' + res.data.score + ')'
          context.response.status = 400
          return Promise.resolve()
        } else {
          return next()
        }
      })
      .catch((error) => {
        context.response.body = 'captcha service not available'
        context.response.status = 500
      })
  }
  return use
}
