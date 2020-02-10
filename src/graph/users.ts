import { gql } from 'apollo-server-koa'
import {GraphQLResolveInfo} from 'graphql'
import {SelectQueryBuilder} from 'typeorm'
import {redis} from '../db'
import User, {IUser} from '../models/user'

export const typeDefs = gql`
type Email {
  address: String! @column(primary: true)
  verified: Boolean! @column
}

enum Role {
  MODERATOR
  ADMIN
  USER
}

type User {
  id: ID! @column(primary: true)
  uid: String @column
  name: String @column
  email: Email @column(name: "email") @relation(name: "emails", field: "emailObj")
  registrationDate: Date @column
  role: Role! @column
  avatarURL: String! @column(name: "avatarPath")

  online: Boolean!
}

type My

extend type Query {
  user(id: ID, uid: String): User @toOne(name: "users")
  my: My
}
`

export const resolvers = {
  User: {
    online(parent: User) {
      return redis.getAsync('onlinestatus:' + parent.id)
        .then((val) => val !== null)
    },
    role(parent: User) {
      return parent.role.toUpperCase()
    },
  },
  Query: {
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
        const selections = context.queryBuilder.expressionMap.selects
        if (selections.length === 1 && selections[0].selection === 'users.id') {
          return { id: args.id }
        }
        return context.queryBuilder.where({ id: args.id })
      } else if (args.uid) {
        return context.queryBuilder.where({ uid: args.uid })
      } else {
        return null
      }
    },
    my(parent: never, args: never, context: { user: IUser }) {
      return context.user
    },
  },
}
