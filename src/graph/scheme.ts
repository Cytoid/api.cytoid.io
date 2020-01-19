import { gql } from 'apollo-server-koa'

const scheme = gql`
scalar FileSize
scalar Date

type Query {
  collection(id: ID!): Collection
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
  coverURL: String
  title: String!
  brief: String!
  description: String!
  owner: User
  levels: [Level!]!
  creationDate: Date!
  modificationDate: Date!
}

type LevelMeta {
  title_localized: String
  artist: String
  illustrator: String
  charter: String
  storyboarder: String
}

enum LevelState {
  PRIVATE
  PUBLIC
  UNLISTED
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
  state: LevelState!
  censored: String
  tags: [String!]!
  category: [String!]!
  owner: User
  creationDate: Date!
  modificationDate: Date!
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
