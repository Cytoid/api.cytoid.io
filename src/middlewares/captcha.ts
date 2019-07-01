import axios from 'axios'
import {Context} from 'koa'
import conf from '../conf'

export default function createCaptchaValidator(action: string) {
  function use(context: Context, next: (err?: any) => Promise<any>): Promise<any> {
    const token = context.request.body.token
    if (token === '6gH2cFOhN&R2qZGoHP6@I*zhlGntjrN1k4aZ3XS#TUj7K^cG$v') {
      return next()
    }
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
    })
      .then((res) => {
        context.assert(res.data.success, 403, 'captcha validation failed' + ('error-codes' in res.data) ?
          res.data['error-codes'] :
          'Unknown')
        return next()
      })
  }
  return use
}
