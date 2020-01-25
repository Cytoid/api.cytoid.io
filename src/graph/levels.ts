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
  id: Int! @column(primary: true)
  version: Int! @column
  uid: String! @column
  title: String! @column
  metadata: LevelMeta! @column
  duration: Float! @column
  size: FileSize! @column
  description: String! @column
  state: ResourceState! @column(name: "published")
  censored: String @column
  tags: [String!]! @column
  category: [String!]! @column
  owner: User @column(name: "owner") @relation(name: "users")
  creationDate: Date! @column
  modificationDate: Date! @column
  bundle: LevelBundle @column @relation(name: "bundles", select: ["path", "content"])
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
