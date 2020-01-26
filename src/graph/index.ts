import * as collections from './collections'
import * as levels from './levels'
import baseTypes from './scheme'
import * as users from './users'
import * as profile from './profile'

export const resolvers = [
  collections.resolvers,
  users.resolvers,
  levels.resolvers,
  profile.resolvers
]

export const typeDefs = [
  collections.typeDefs,
  levels.typeDefs,
  users.typeDefs,
  profile.typeDefs,
  baseTypes,
]
