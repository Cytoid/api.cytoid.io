import {GraphQLResolveInfo} from 'graphql'
import {getManager} from 'typeorm'
import Collection from '../models/collection'
import Email from '../models/email'
import User from '../models/user'
import {GraphQLFieldNames, GraphQLJoin, GraphQLJoinProperty} from '../utils/graph_joiner'

const db = getManager()
export const resolvers = {
  User: {
    email(parent: User) {
      return parent.emailObj
    },
  },
}

export function FitUserEmail(user: User) {
  if (!user) {
    return user
  }
  user.emailObj = user.emailObj || {} as Email
  user.emailObj.address = user.emailObj.address || user.email
  return user
}

export function Join(key: string) {
  return (parent: any, args: never, context: any, info: GraphQLResolveInfo) => {
    const qb = db.createQueryBuilder(User, 'users')
    const result = GraphQLJoin(info, qb, 'id', parent[key])
    if (result) {
      return result
    }
    GraphQLJoinProperty(info, qb, 'email', 'address', 'emailObj', 'emails')
    if (GraphQLFieldNames(info).find((i) => i.name.value === 'avatarURL')) {
      qb.addSelect(['users.email', 'users.avatarPath'])
    }
    return qb.getOne()
      .then(FitUserEmail)
  }
}
