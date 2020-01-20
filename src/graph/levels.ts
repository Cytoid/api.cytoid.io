import { join } from 'path'
import {Level} from '../models'
import {ILevelBundle} from '../models/level'
import conf from '../conf'

export const resolvers = {
  Level: {
    state(parent: Level) {
      if (parent.published === true) {
        return 'PUBLIC'
      } else if (parent.published === false) {
        return 'PRIVATE'
      } else {
        return 'UNLISTED'
      }
    },
  },
  LevelBundle: {
    backgroundImage(parent: ILevelBundle) {
      return conf.assetsURL + '/' + join(parent.path, parent.content.background)
    },
    music(parent: ILevelBundle) {
      return conf.assetsURL + '/' + join(conf.assetsURL, parent.path, parent.content.music)
    },
    musicPreview(parent: ILevelBundle) {
      return conf.assetsURL + '/' + join(conf.assetsURL, parent.path, parent.content.music_preview)
    },
  },
}
