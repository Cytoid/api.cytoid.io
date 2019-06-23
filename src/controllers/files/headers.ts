import { getManager } from 'typeorm'
import Profile from '../../models/profile'
import { IUser } from '../../models/user'
import {IFileUploadHandler, IFileUploadSessionData} from './index'

const db = getManager()

const HeaderUploadHandler: IFileUploadHandler =  {
  uploadLinkTTL: 3600,
  targetPath: 'headers',
  contentType: 'image/*',
  async callback(user: IUser, session: IFileUploadSessionData) {
    await db.createQueryBuilder(Profile, 'profile')
      .update({ headerPath: session.path })
      .where({ id: user.id })
      .execute()
    return null
  },
}
export default HeaderUploadHandler
