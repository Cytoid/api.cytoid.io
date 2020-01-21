import * as collections from './collections'
import * as levels from './levels'
import baseTypes from './scheme'
import * as users from './users'

export const resolvers = [
  collections.resolvers,
  users.resolvers,
  levels.resolvers,
]

export const typeDefs = [
  collections.typeDefs,
  levels.typeDefs,
  users.typeDefs,
  baseTypes,
]
