import {Get, JsonController, Param} from 'routing-controllers'
import {getRepository} from 'typeorm'
import User from '../models/user'

@JsonController('/profile')
export default class ProfileController {
  private userRepo = getRepository(User)
  @Get('/:id')
  public async getProfile(@Param('id') id: string) {
    // Testign if the id is a uuid. Case insensitive.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    const user = await this.userRepo.findOne({
      where: isUUID ? { id } : { uid: id},
    })
    return user
  }
}
