import { NextFunction, Request, Response } from 'express'
import { ExpressErrorMiddlewareInterface, Middleware } from 'routing-controllers'

interface IHttpError extends Error {
  status: number
}
@Middleware({ type: 'after' })
export default class ErrorHandler implements ExpressErrorMiddlewareInterface {
  public error(error: IHttpError, req: Request, res: Response, next: NextFunction): any {
    if (res.headersSent) {
      return
    }
    if (error.status && error.status < 500) {
      res.status(error.status).send(error.message)
      return
    }
    next(error)
  }
}
