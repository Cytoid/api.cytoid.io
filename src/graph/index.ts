import * as Authenticator from './Authenticator'
import * as collections from './collections'
import * as levels from './levels'
import * as likes from './likes'
import * as profile from './profile'
import baseTypes from './scheme'
import * as SQLJoiner from './SQLJoiner'
import * as users from './users'

export const resolvers = [
  collections.resolvers,
  users.resolvers,
  levels.resolvers,
  profile.resolvers,
]

export const typeDefs = [
  collections.typeDefs,
  levels.typeDefs,
  users.typeDefs,
  profile.typeDefs,
  SQLJoiner.typeDefs,
  Authenticator.typeDefs,
  baseTypes,
]

export const directives = {
  toOne: SQLJoiner.SQLToOneJoiner,
  toMany: SQLJoiner.SQLToManyJoiner,
  auth: Authenticator.Authenticator,
}
