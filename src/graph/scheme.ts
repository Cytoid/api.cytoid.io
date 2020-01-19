import { gql } from 'apollo-server-koa'

const scheme = gql`
scalar FileSize
scalar Date

type Query {
  collection(id: ID, uid: String): Collection
}

type ResourceMetaProperty {
  artist: String!
  source: String
}

type ResourceMeta {
  cover: ResourceMetaProperty
}

type Mutation {
  createCollection(
    uid: String!
    ownerId: ID!
    coverPath: ID
    title: String
    brief: String
    description: String
  ): Collection
}

type Collection {
  id: ID!
  uid: String!
  coverPath: String
  title: String!
  brief: String!
  description: String!
  owner: User
  levels: [Level!]!
  creationDate: Date!
  modificationDate: Date!
  tags: [String!]!
  state: ResourceState!
  metadata: ResourceMeta!
}

type LevelMeta {
  title_localized: String
  artist: String
  illustrator: String
  charter: String
  storyboarder: String
}

enum ResourceState {
  PRIVATE
  PUBLIC
  UNLISTED
}

type LevelBundle {
  music: String
  musicPreview: String
  backgroundImage: String
}

type Level {
  id: Int!
  version: Int!
  uid: String!
  title: String!
  metadata: LevelMeta!
  duration: Float!
  size: FileSize!
  description: String!
  state: ResourceState!
  censored: String
  tags: [String!]!
  category: [String!]!
  owner: User
  creationDate: Date!
  modificationDate: Date!
  bundle: LevelBundle
}

type Email {
  address: String!
  verified: Boolean!
}

type User {
  id: ID!
  uid: String
  name: String
  email: Email
  registrationDate: Date
  role: String!
  avatarURL: String!
}
`

export default scheme
