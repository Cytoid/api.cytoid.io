import { gql } from 'apollo-server-koa'
import { getManager } from 'typeorm'
import Thread from '../models/thread'

export const scheme = gql`
type DisqusUser {
  name: String!
  username: String!
}
type Comment {
  content: String!
  creationDate: Date!
  owner: User
  disqusUser: DisqusUser
  comments: [Comment!]!
}
type Thread {
  category: String!
  key: String!
  comments: [Comment!]!
}
extend type Query {
  thread(category: String!, key: String!): Thread
  recentComments(limit: Integer!): [Comments!]!
}
`

const datastore = getManager('data')
export const resolvers = {
  Query: {
    thread(
      parent: never,
      args: { category: string, key: string },
      ): Promise<Thread> {
      return datastore.getMongoRepository(Thread).findOne({
        category: args.category,
        key: args.key,
      })
    },
  },
}
