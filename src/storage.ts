import {Storage as GoogleStorage} from '@google-cloud/storage'
import config from './conf'

const storage = new GoogleStorage({
  projectId: 'cytoid'
})
const assetBucket = storage.bucket('assets.cytoid.io')

export default class Storage {
  static async getUploadURL(path: string, contentType: string = '*/*', ttl: number): Promise<string>{
    const file = assetBucket.file(path)
    const signedURL = await file.getSignedUrl({
      action: 'write',
      expires: Date.now() + ttl*1000,
      contentType,
    })
    return signedURL[0]
  }
}
