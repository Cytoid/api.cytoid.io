import {randomBytes} from 'crypto'
import {
  Authorized, BadRequestError,
  CurrentUser, ForbiddenError, Get, HttpCode, InternalServerError, JsonController, NotFoundError,
  Param, Params,
  Post, UseBefore,
} from 'routing-controllers'
import {redis} from '../../db'
import CaptchaMiddleware from '../../middlewares/captcha'
import File from '../../models/file'
import {IUser} from '../../models/user'
import BaseController from '../base'
import AvatarHandler from './avatar'
import LevelHandler from './levels'

import {GetSignedUrlConfig, Storage as GoogleStorage} from '@google-cloud/storage'

const storage = new GoogleStorage({
  projectId: 'cytoid',
})
const assetBucket = storage.bucket('assets.cytoid.io')

function getUploadURL(path: string, contentType: string = null, ttl: number): Promise<string>{
  const file = assetBucket.file(path)
  const options: GetSignedUrlConfig = {
    action: 'write',
    expires: Date.now() + ttl * 1000,
  }
  if (contentType) {
    options.contentType = contentType
  }
  console.log(options)
  return file.getSignedUrl(options)
    .then((v) => v[0])
}

export interface IFileUploadHandler {
  uploadLinkTTL: number
  targetPath: string
  contentType?: string
  callback?: (user: IUser, session: IFileUploadSessionData) => any
}

const FileUploadHandlers: { [key: string]: IFileUploadHandler } = {
  packages: LevelHandler,
  avatar: AvatarHandler,
}

export interface IFileUploadSessionData {
  name: string,
  path: string,
  ownerId: string,
  type: string,
}

@JsonController('/files')
export default class FileController extends BaseController {
  private getRedisKey(path: string) {
    return 'files:upload:' + path
  }

  /**
   * Generate the package upload key, create the temporary file in the db,
   * and sign the upload URL from Google Cloud Storage.
   * @param user
   * @param type
   */
  @Post('/:type')
  @Authorized()
  @UseBefore(CaptchaMiddleware('upload'))
  public async createFile(
    @CurrentUser() user: IUser,
    @Param('type') type: string,
  ) {
    const handler = FileUploadHandlers[type]
    if (!handler) {
      throw new BadRequestError("File type doesn't exist")
    }
    const packageName = (await randomBytes(50))
      .toString('base64')
      .replace(/\W/g, '') // Making package name URL safe
    const path = handler.targetPath + '/' + packageName
    const sessionData: IFileUploadSessionData = {
      name: packageName,
      path,
      ownerId: user.id,
      type,
    }
    await redis.setexAsync(this.getRedisKey(path), handler.uploadLinkTTL + 600, JSON.stringify(sessionData))
    return {
      uploadURL: await getUploadURL(path, handler.contentType, handler.uploadLinkTTL),
      path,
    }
  }

  /**
   * Verify the upload key, unpackage and analyze the package, create the bundle directory,
   * extract the metadata from the package, save it into the database, and return the metadata.
   * @param paths
   * @param user
   */
  @Post(/\/(.+\/.+)/)
  @HttpCode(201)
  @Authorized()
  public async createFileCallback(
    @Params() paths: any,
    @CurrentUser() user: IUser,
  ) {
    const path = paths['0']
    const redisKey = this.getRedisKey(path)
    const sessionData: IFileUploadSessionData = JSON.parse(await redis.getAsync(redisKey))
    if (!sessionData) {
      throw new NotFoundError('Access Key not exist or expired')
    }
    if (sessionData.ownerId !== user.id) {
      throw new ForbiddenError()
    }
    await redis.delAsync(redisKey)
    const newFile = new File(path, sessionData.type)
    newFile.ownerId = sessionData.ownerId
    await this.db.save(newFile, {transaction: false})
    const handler = FileUploadHandlers[sessionData.type]
    if (handler.callback) {
      return handler.callback(user, sessionData)
    }
  }
}
