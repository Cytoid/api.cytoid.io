import * as collections from './collections'
import * as users from './users'
import * as levels from './levels'

export const resolvers = [
  collections.resolvers,
  users.resolvers,
  levels.resolvers,
]

export { default as typeDefs } from './scheme'
