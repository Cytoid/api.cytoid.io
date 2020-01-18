import { UserInputError } from 'apollo-server-koa'
import {FieldNode, GraphQLResolveInfo} from 'graphql'
import { getManager, ObjectID } from 'typeorm'
import Collection from '../models/collection'
import Email from '../models/email'
import { Level } from '../models/level'
import User from '../models/user'

const datastore = getManager('data')
const db = getManager()

export const resolvers = {
  Query: {
    collection(parent: never, { id }: { id: string }, context: any, info: GraphQLResolveInfo) {
      return datastore.getMongoRepository(Collection).findOne(id)
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
      const query = info.fieldNodes.find((field) => field.name.value === info.fieldName)
      const allFields = query.selectionSet.selections
        .filter((selection) => selection.kind === 'Field') as [FieldNode]
      const fields = allFields
        .map((selection) => selection.name.value)
      if (fields.length === 0) {
        return {}
      }
      if (fields.length === 1 && fields[0] === 'id') {
        return { id: parent.ownerId }
      }
      let qb = db.createQueryBuilder(User, 'users')
        .select(fields.map((f) => 'users.' + f))
        .where({ id: parent.ownerId })

      // Join with emails
      const emailFields = allFields.filter((f) => (f.name.value === 'email'))
      if (emailFields.length > 0) {
        const emailField = emailFields[0]
        const emailSelections = emailField.selectionSet.selections.filter((f) => f.kind === 'Field') as [FieldNode]
        const fieldNames = emailSelections.map((f) => f.name.value)
        if (fieldNames.length === 0) {
          // Do nothing
        } else if (fieldNames.length === 1 && fieldNames[0] === 'address') {
          // Do nothing
        } else {
          qb = qb.leftJoin('users.emailObj', 'emails')
            .addSelect(fieldNames.map((f) => 'emails.' + f))
        }
      }
      return qb.getOne()
        .then((user) => {
          user.emailObj = user.emailObj || {} as Email
          user.emailObj.address = user.emailObj.address || user.email
        })
    },
    levels(
      parent: Collection,
      args: never,
      context: any,
      info: GraphQLResolveInfo): Array<Partial<Level>> | Promise<Array<Partial<Level>>> {
      const query = info.fieldNodes.find((field) => field.name.value === info.fieldName)
      const fields = query.selectionSet.selections
        .filter((selection) => selection.kind === 'Field')
        .map((selection) => (selection as FieldNode).name.value)
      if (fields.length === 0) {
        return []
      }
      if (fields.length === 1 && fields[0] === 'id') {
        return parent.levelIds.map((id) => ({ id }))
      }
      return db.getRepository(Level).findByIds(parent.levelIds, { select: fields as Array<keyof Level>})
    },
  },
}
