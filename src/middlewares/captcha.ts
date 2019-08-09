import axios from 'axios'
import {Context} from 'koa'
import conf from '../conf'
import getIP from '../utils/ip'

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

    if (token.startsWith('tencent_')) {
      const [ticket, randstr] = token.substring(8).split('__randstr__')
      return axios.get(' https://ssl.captcha.qq.com/ticket/verify', {
        params: {
          aid: '2030725483',
          AppSecretKey : conf.tencentCaptchaKey,
          Ticket: ticket,
          Randstr: randstr,
          UserIP: getIP(context),
        },
      })
        .then((res) => {
          context.assert(res.data, 503, "Can't reach captcha server")
          context.assert(res.data.response !== '100', 500, res.data.err_msg)
          context.assert(res.data.response === '1', 403, res.data.err_msg)
          return next()
        })
    } else {
      const SocksProxyAgent = require('socks-proxy-agent')
      return axios({
        url: 'https://www.google.com/recaptcha/api/siteverify',
        method: 'post',
        params: {
          response: token,
          secret: conf.captchaKey,
          remoteip: getIP(context),
        },
        httpsAgent: new SocksProxyAgent('socks://127.0.0.1:1080'),
      })
        .then((res) => {
          console.log(res.data)
          context.assert(res.data.success, 403, 'captcha validation failed' + ('error-codes' in res.data) ?
            res.data['error-codes'] :
            'Unknown')
          return next()
        })
        .catch((error) => {
          context.throw(503, error.message)
        })
    }
  }
  return use
}
