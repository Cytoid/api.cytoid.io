import { gql } from 'apollo-server-koa'
import { join } from 'path'
import conf from '../conf'
import {Level} from '../models'
import {ILevelBundle} from '../models/level'

export const typeDefs = gql`
type LevelMeta {
  title_localized: String
  artist: ResourceMetaProperty
  illustrator: ResourceMetaProperty
  charter: ResourceMetaProperty
  storyboarder: ResourceMetaProperty
}

type LevelBundle {
  music: String
  musicPreview: String
  backgroundImage: String
}

type Level {
  id: Int!
  version: Int!
  uid: String!
  title: String!
  metadata: LevelMeta!
  duration: Float!
  size: FileSize!
  description: String!
  state: ResourceState!
  censored: String
  tags: [String!]!
  category: [String!]!
  owner: User
  creationDate: Date!
  modificationDate: Date!
  bundle: LevelBundle
}

`

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
