import { getManager } from "typeorm"

export default class BaseController {
  public db = getManager()
}
