import {Level} from '../models'

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
}
