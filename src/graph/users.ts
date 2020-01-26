import { gql } from 'apollo-server-koa'
import {GraphQLResolveInfo} from 'graphql'
import {SelectQueryBuilder} from 'typeorm'
import User from '../models/user'

export const typeDefs = gql`
type Email {
  address: String! @column(primary: true)
  verified: Boolean! @column
}

type User {
  id: ID! @column(primary: true)
  uid: String @column
  name: String @column
  email: Email @column(name: "email") @relation(name: "emails", field: "emailObj")
  registrationDate: Date @column
  role: String! @column
  avatarURL: String! @column(name: "avatarPath")
}

type Profile {
  user: User @toOne(name: "users")
}

extend type Query {
  profile(id: ID, uid: String): Profile
  user(id: ID, uid: String): User @toOne(name: "users")
}
`

export const resolvers = {
  Profile: {
    user(
      parent: { id: string, uid: string},
      args: any,
      context: {queryBuilder: SelectQueryBuilder<User>}) {
      if (parent.id) {
        return context.queryBuilder.where({ id: parent.id })
      }
      if (parent.uid) {
        return context.queryBuilder.where({ uid: parent.uid })
      }
      return null
    },
  },
  Query: {
    profile(
      parent: never,
      args: {
        id: string,
        uid: string,
      },
      context: any,
      info: GraphQLResolveInfo,
    ) {
      if (args.id || args.uid) {
        return args
      } else {
        return null
      }
    },
    user(
      parent: never,
      args: {
        id: string,
        uid: string,
      },
      context: { queryBuilder: SelectQueryBuilder<User> },
      info: GraphQLResolveInfo,
    ) {
      if (args.id) {
        return context.queryBuilder.where({ id: args.id })
      } else if (args.uid) {
        return context.queryBuilder.where({ uid: args.uid })
      } else {
        return null
      }
    },
  },
}
