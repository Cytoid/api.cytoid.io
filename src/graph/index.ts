import * as collections from './collections'
import * as users from './users'

export const resolvers = [
  collections.resolvers,
  users.resolvers,
]

export { default as typeDefs } from './scheme'
