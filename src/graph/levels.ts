import { join } from 'path'
import {Level} from '../models'
import {ILevelBundle} from '../models/level'

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
      return join(parent.path, parent.content.background)
    },
    music(parent: ILevelBundle) {
      return join(parent.path, parent.content.music)
    },
    musicPreview(parent: ILevelBundle) {
      return join(parent.path, parent.content.music_preview)
    },
  },
}
