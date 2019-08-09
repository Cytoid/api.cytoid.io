import {Context} from 'koa'

export default function getIP(ctx: Context): string {
  return (ctx.get('x-forwarded-for') || '').split(',').pop() ||
    ctx.req.connection.remoteAddress ||
    ctx.req.socket.remoteAddress
}
