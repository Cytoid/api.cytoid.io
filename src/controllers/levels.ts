import {Get, Put, JsonController, Post, Param, BodyParam, NotFoundError, InternalServerError, BadRequestError} from 'routing-controllers'
import BaseController from './base'
import { randomBytes } from 'crypto'
import Storage from '../storage'
import {getRepository} from 'typeorm'
import { Level, Rating, Chart } from '../models/level'
import File from '../models/file'

import {redis} from '../db'

import axios from 'axios'

@JsonController('/levels')
export default class LevelController extends BaseController {
  private fileRepo = getRepository(File)
  private levelRepo = getRepository(Level)

  @Get('/:id')
  async getLevel(@Param('id') id: string) {
    return this.levelRepo.findOne({
      where: [
        {uid: id},
      ]
    })
  }

  createPackageConfig = {
    packageLen: 30,
    redisPrefix: 'cytoid:levelcreate:',
    unpkgURL: 'http://localhost:5000/resolve-level-files',
    packagePath: 'levels/packages/',
    bundlePath: 'levels/bundles/'
  }
  @Post('/packages')
  async createPackage(@BodyParam('key') key: string) {
    if (!key) return this.signPackageUploadURL()
    else return this.unpackPackage(key)
  }
  async signPackageUploadURL() {
    const ttl = 600
    const packageName = (await randomBytes(this.createPackageConfig.packageLen))
      .toString('base64')
      .replace(/\W/g, '')
    const path = this.createPackageConfig.packagePath + packageName
    const file = new File()
    file.url = path
    // TODO: mark the file owner
    const key = (await randomBytes(15)).toString('base64')
    await Promise.all([
      this.db.save(file),
      redis.setex(this.createPackageConfig.redisPrefix + key, ttl, packageName)
    ])
    return {
      uploadURL: await Storage.getUploadURL(path, 'application/zip', ttl),
      key: key
    }
  }
  async unpackPackage(key: string) {
    console.log(key)
    const packageName = await redis.getAsync(this.createPackageConfig.redisPrefix + key)
    console.log(packageName)
    console.log({
      packagePath: this.createPackageConfig.packagePath + packageName,
      bundlePath: this.createPackageConfig.bundlePath + packageName,
    })
    if (!packageName) {
      throw new NotFoundError('Access Key not exist or expired')
    }
    const response = await axios.post(this.createPackageConfig.unpkgURL, {
      packagePath: this.createPackageConfig.packagePath + packageName,
      bundlePath: this.createPackageConfig.bundlePath + packageName,
    }, {headers: {'content-type': 'application/json'}}).catch(error => {
      if (error.response && error.response.data) {
        throw new BadRequestError(error.response.data.message || 'Unknown Error')
      }
      throw new InternalServerError('Errors in package analytics services')
    })
    return response.data
    //return metadata
  }
}
