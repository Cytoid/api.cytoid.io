import { gql } from 'apollo-server-koa'
import {GraphQLResolveInfo} from 'graphql'
import { join } from 'path'
import {Equal, getManager, Not, SelectQueryBuilder} from 'typeorm'
import conf from '../conf'
import {Level} from '../models'
import {ILevelBundle} from '../models/level'
import User from '../models/user'

const db = getManager()
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

type Chart {
  name: String @column
  difficulty: Int! @column
  type: String! @column
  notesCount: Int! @column
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
  owner: User @column(name: "ownerId") @relation(name: "users", field: "owner")
  creationDate: Date! @column
  modificationDate: Date! @column
  bundle: LevelBundle @column @relation(name: "bundles", select: ["path", "content"])
  charts: [Chart!]! @reverseRelation(name: "charts")
}

extend type Query {
  level(uid: String!): Level @toOne(name: "levels")
}
extend type User {
  levelsCount(category: String): Int!
  levels(first: Int, category: String): [UserLevel!]! @toMany(name: "levels")
}
type UserLevel {
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
  creationDate: Date! @column
  modificationDate: Date! @column
  bundle: LevelBundle @column @relation(name: "bundles", select: ["path", "content"])
  charts: [Chart!]! @reverseRelation(name: "charts")
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
      return conf.assetsURL + '/' + join(parent.path, parent.content.music)
    },
    musicPreview(parent: ILevelBundle) {
      return conf.assetsURL + '/' + join(parent.path, parent.content.music_preview)
    },
  },
  Query: {
    level(
      parent: never,
      args: {
        uid: string,
      },
      context: { queryBuilder: SelectQueryBuilder<User> },
    ) {
      return context.queryBuilder.where({ uid: args.uid, published: Not(Equal(false)) })
    },
  },
  User: {
    levelsCount(parent: User, args: { category: string } ) {
      const qb = db.createQueryBuilder('levels', 'levels')
      if (args.category === 'featured') {
        qb.select("count(levels.id) filter (WHERE 'featured'=ANY(levels.category)) as count")
      } else if (args.category === '!featured') {
        qb.select("count(levels.id) filter (WHERE NOT 'featured'=ANY(levels.category)) as count")
      } else {
        qb.select('count(levels.id) as count')
      }
      return qb.where({ ownerId: parent.id, published: true })
        .getRawOne()
        .then((value) => parseInt(value.count, 10))
    },
    levels(
      parent: User,
      args: { category: string, first: number },
      context: { queryBuilder: SelectQueryBuilder<Level>} ) {
      const qb = context.queryBuilder
        .where({ ownerId: parent.id, published: true })
      if (args.first) {
        qb.limit(args.first)
      }
      if (args.category === 'featured') {
        qb.andWhere("'featured'=ANY(levels.category)")
      } else if (args.category === '!featured') {
        qb.andWhere("NOT ('featured'=ANY(levels.category))")
      }
      return qb
    },
  },
}
