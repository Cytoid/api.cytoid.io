import * as collections from './collections'
import * as users from './users'
import * as levels from './levels'
import * as threads from './threads'
import { default as baseTypeDefs } from './scheme'

export const resolvers = [
  collections.resolvers,
  users.resolvers,
  levels.resolvers,
  threads.resolvers,
]

export const typeDefs = [
  baseTypeDefs,
  threads.scheme,
]
