import { UserInputError } from 'apollo-server-koa'
import {FieldNode, GraphQLResolveInfo} from 'graphql'
import { getManager, ObjectID } from 'typeorm'
import Collection from '../models/collection'
import Email from '../models/email'
import { Level } from '../models/level'
import User from '../models/user'
import {
  GraphQLFieldNames,
  GraphQLFieldNamesForKeyPath,
  GraphQLJoin,
  GraphQLJoinMany,
  GraphQLJoinProperty
} from '../utils/graph_joiner'
import {FitUserEmail} from './users'

const datastore = getManager('data')
const db = getManager()

export const resolvers = {
  Query: {
    collection(
      parent: never,
      { id, uid }: {
        id: string,
        uid: string,
      },
      context: any,
      info: GraphQLResolveInfo,
    ) {

      if (id) {
        return datastore.getMongoRepository(Collection).findOne(id)
      }
      if (uid) {
        return datastore.getMongoRepository(Collection).findOne({ uid })
      }
      return null
    },
  },
  Mutation: {
    createCollection(parent: never, collection: any, context: any, info: GraphQLResolveInfo) {
      return db.createQueryBuilder()
        .select('count(*)')
        .from(User, 'users')
        .where('users.id=:id', { id: collection.ownerId })
        .limit(1)
        .execute()
        .catch((error) => {
          if (error.code === '22P02') {
            throw new UserInputError('ownerId has to be a valid UUID', { ownerId: collection.ownerId })
          }
          throw error
        })
        .then((a) => {
          if (parseInt(a[0].count, 10) === 0) {
            throw new UserInputError('Can not find the user specified', { ownerId: collection.ownerId })
          }
          const newCollection =  datastore.create(Collection, {
            uid: collection.uid,
            title: collection.title || 'Untitled',
            brief: collection.brief || '',
            description: collection.description || '',
            ownerId: collection.ownerId,
            levelIds: [],
          })
          return datastore.save(newCollection)
        })
    },
  },
  Collection: {
    owner(parent: Collection, args: never, context: any, info: GraphQLResolveInfo) {
      const qb = db.createQueryBuilder(User, 'users')
      const result = GraphQLJoin(
        info,
        qb,
        'id',
        parent.ownerId,
        (f) => f.filter((a) => a !== 'avatarURL')
      )
      if (result) {
        return result
      }
      GraphQLJoinProperty(info, qb, 'email', 'address', 'emailObj', 'emails')
      if (GraphQLFieldNames(info).find((i) => i.name.value === 'avatarURL')) {
        qb.addSelect(['users.email', 'users.avatarPath'])
      }
      return qb.getOne()
        .then(FitUserEmail)
    },
    levels(
      parent: Collection,
      args: never,
      context: any,
      info: GraphQLResolveInfo): Array<Partial<Level>> | Promise<Array<Partial<Level>>> {
      const qb = db.createQueryBuilder(Level, 'levels')
      const result = GraphQLJoinMany(info, qb, 'id', parent.levelIds)
      if (result) {
        return result
      }
      GraphQLJoinProperty(
        info,
        qb,
        'owner',
        'id',
        'levels.owner',
        'users',
        (f) => f.filter((a) => a !== 'avatarURL')
      )

      const ownerFieldNames = GraphQLFieldNamesForKeyPath(info, 'owner')
      if (ownerFieldNames && ownerFieldNames.find((i) => i.name.value === 'avatarURL')) {
        qb.addSelect(['users.email', 'users.avatarPath'])
      }
      GraphQLJoinProperty(info, qb, 'owner.email', 'address', 'users.emailObj', 'emails')
      if (GraphQLFieldNames(info).find((i) => i.name.value === 'bundle')) {
        qb.leftJoin('levels.bundle', 'bundle').addSelect(['bundle.path', 'bundle.content'])
      }
      return qb.getMany()
        .then((levels) => {
          for (const level of levels) {
            FitUserEmail(level.owner)
          }
          return levels
        })
    },
  },
}
