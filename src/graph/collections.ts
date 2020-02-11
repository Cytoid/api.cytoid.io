import {Permission} from 'accesscontrol'
import { AuthenticationError, ForbiddenError, UserInputError } from 'apollo-server-koa'
import { gql } from 'apollo-server-koa'
import { GraphQLResolveInfo} from 'graphql'
import { ObjectID } from 'mongodb'
import {getManager, SelectQueryBuilder} from 'typeorm'
import ac from '../access'
import Collection from '../models/collection'
import User, {IUser} from '../models/user'
const datastore = getManager('data')
const db = getManager()

export const typeDefs = gql`
extend type Query {
  collectionsCount: Int!
  collection(id: ID, uid: String): Collection
  collections(limit: Int, cursor: ID): [Collection!]!
}

extend type User {
  collectionsCount: Int!
  collections(first: Int): [CollectionUserListing!]!
}

extend type My {
  collections: [CollectionUserListing!]!
}

input CollectionInput {
  uid: String
  coverPath: String
  title: String
  slogan: String
  description: String
  levelIds: [Int!]
  tags: [String!]
  state: ResourceState
}

extend type Mutation {
  updateCollection(id: ID!, input: CollectionInput!): CollectionUserListing
  createCollection(input: CollectionInput!): CollectionUserListing
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
    collectionsCount() {
      return datastore.getMongoRepository(Collection).count({
        state: 'PUBLIC',
      })
    },
    collections(parent: never, { limit, cursor }: { limit: number, cursor: string}): Promise<Collection[]> {
      if (!limit) {
        limit = 24
      }
      if (limit < 1) {
        limit = 1
      }
      if (limit > 48) {
        limit = 4
      }
      const repo = datastore.getMongoRepository(Collection)
      if (cursor) {
        return repo.find({
          where: {
            state: 'PUBLIC',
            _id: { $gt: ObjectID.createFromHexString(cursor) },
          },
          take: limit,
          order: {
            id: 'ASC',
          },
        })
      }
      return repo.find({
        where: {
          state: 'PUBLIC',
        },
        take: limit,
        order: {
          id: 'ASC',
        },
      })
    },
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
      if (params.input.uid) {
        const existingCollection = await datastore.getMongoRepository(Collection).findOne({ uid: params.input.uid })
        if (existingCollection.id.toString() !== params.id) {
          throw new UserInputError('UID duplicated')
        }
      }
      return repo.update(params.id, params.input)
        .then((a) => repo.findOne(params.id))
    },
    async createCollection(parent: never, params: {input: any}, context: { user: IUser }, info: GraphQLResolveInfo) {
      if (!context.user) {
        throw new AuthenticationError('Login required')
      }
      const permission: Permission = ac.can(context.user.role).createOwn('collection')
      if (!permission.granted) {
        throw new ForbiddenError('You do not have the permissions to create a collection.')
      }
      if (!params.input.uid) {
        throw new UserInputError('UID is required')
      }
      const existingCollection = await datastore.getMongoRepository(Collection).findOne({ uid: params.input.uid })
      if (existingCollection) {
        throw new UserInputError(`Collection with UID ${params.input.uid} already exist`)
      }
      const newCollection =  datastore.create(Collection, {
        uid: params.input.uid,
        title: params.input.title || 'Untitled',
        slogan: params.input.slogan || '',
        description: params.input.description || '',
        ownerId: context.user.id,
        levelIds: params.input.levelIds || [],
        coverPath: params.input.coverPath,
        state: 'PUBLIC',
        tags: params.input.tags || [],
        metadata: {},
      })
      return datastore.save(newCollection)
    },
  },
  My: {
    collections(parent: IUser): Promise<Collection[]> {
      return datastore.getMongoRepository(Collection).find({
        where: {
          ownerId: parent.id,
        },
      })
    },
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
