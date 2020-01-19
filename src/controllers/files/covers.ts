import { IUser } from '../../models/user'
import {IFileUploadHandler} from './index'

const CoverUploadHandler: IFileUploadHandler =  {
  uploadLinkTTL: 3600,
  targetPath: 'covers',
  contentType: 'image/*',
}
export default CoverUploadHandler
