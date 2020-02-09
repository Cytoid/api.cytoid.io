import {Permission} from 'accesscontrol'
import { AuthenticationError, ForbiddenError } from 'apollo-server-koa'
import { gql } from 'apollo-server-koa'
import { GraphQLResolveInfo} from 'graphql'
import {getManager, SelectQueryBuilder} from 'typeorm'
import Collection from '../models/collection'
import User, {IUser} from '../models/user'
import ac from '../access'
const datastore = getManager('data')
const db = getManager()

export const typeDefs = gql`
extend type Query {
  collection(id: ID, uid: String): Collection
}

extend type User {
  collectionsCount: Int!
  collections(first: Int): [CollectionUserListing!]!
}

input CollectionInput {
  uid: String
  coverPath: String
  title: String
  slogan: String
  description: String
  levels: [Int!]
  tags: [String!]
  state: ResourceState
}

extend type Mutation {
  updateCollection(id: ID!, input: CollectionInput!): CollectionUserListing
}

type CollectionUserListing {
  id: ID!
  uid: String!
  coverPath: String
  title: String!
  slogan: String!
  description: String!
  levelCount: Int!
  creationDate: Date!
  modificationDate: Date!
  tags: [String!]!
  state: ResourceState!
  metadata: ResourceMeta!
}

type Collection {
  id: ID!
  uid: String!
  coverPath: String
  title: String!
  slogan: String!
  description: String!
  owner: User @toOne(name: "users", field: "ownerId")
  levelCount: Int!
  levels(limit: Int): [Level!]! @toMany(name: "levels", field: "levelIds")
  creationDate: Date!
  modificationDate: Date!
  tags: [String!]!
  state: ResourceState!
  metadata: ResourceMeta!
}
`

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
        return datastore.getMongoRepository(Collection).findOne({
          where: {
            id,
            $or: [
              { state: 'PUBLIC' },
              { state: 'UNLISTED' },
            ],
          },
        })
      }
      if (uid) {
        return datastore.getMongoRepository(Collection).findOne({
          where: {
            uid,
            $or: [
              { state: 'PUBLIC' },
              { state: 'UNLISTED' },
            ],
          },
        })
      }
      return null
    },
  },
  Mutation: {
    async updateCollection(parent: never, params: {id: string, input: any}, context: { user: IUser } ) {
      if (!context.user) {
        throw new AuthenticationError('Login Required')
      }
      const repo = datastore.getMongoRepository(Collection)
      const collection = await repo.findOne(params.id)

      let permission: Permission
      if (collection.ownerId === context.user.id) {
        permission = ac.can(context.user.role).updateOwn('collection')
      } else {
        permission = ac.can(context.user.role).updateAny('collection')
      }

      if (!permission.granted) {
        throw new ForbiddenError('You do not have the permissions to update this collection.')
      }

      return repo.update(params.id, params.input)
        .then((a) => repo.findOne(params.id))
    },
    /*
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
            slogan: collection.slogan || '',
            description: collection.description || '',
            ownerId: collection.ownerId,
            levelIds: [],
          })
          return datastore.save(newCollection)
        })
    },
     */
  },
  Collection: {
    owner(
      parent: Collection,
      args: never,
      context: { queryBuilder: SelectQueryBuilder<User> },
      info: GraphQLResolveInfo) {
      return context.queryBuilder
    },
    levels(
      parent: Collection,
      { limit }: { limit: number },
      context: { queryBuilder: SelectQueryBuilder<User> },
      info: GraphQLResolveInfo) {
      return context.queryBuilder.andWhere('levels.published = true')
    },
    levelCount(parent: Collection) {
      return parent.levelIds.length
    },
  },
  CollectionUserListing: {
    levelCount(parent: Collection) {
      return parent.levelIds.length
    },
  },
  User: {
    collections(
      parent: User,
      { first }: { first: number },
      context: { queryBuilder: SelectQueryBuilder<User> },
      info: GraphQLResolveInfo) {
      return datastore.getMongoRepository(Collection).find({
        where: {
          ownerId: parent.id,
          state: 'PUBLIC',
        },
        take: first,
      })
    },
    collectionsCount(
      parent: User,
    ) {
      return datastore.getMongoRepository(Collection).count({
        ownerId: parent.id,
        state: 'PUBLIC',
      })
    },
  },
}
