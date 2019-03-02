import { database, redis } from '../db'

export default class BaseController {
  public db = database
  public redis = redis
}
