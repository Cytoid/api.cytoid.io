import { getManager } from 'typeorm'
import User, {IUser} from '../../models/user'
import {IFileUploadHandler, IFileUploadSessionData} from './index'

const db = getManager()

const AvatarUploadHandler: IFileUploadHandler =  {
  uploadLinkTTL: 3600,
  targetPath: 'avatar',
  contentType: 'image/*',
  async callback(user: IUser, session: IFileUploadSessionData) {
    await db.createQueryBuilder(User, 'users')
      .update({ avatarPath: session.path })
      .where({ id: user.id })
      .execute()
    return null
  },
}
export default AvatarUploadHandler
