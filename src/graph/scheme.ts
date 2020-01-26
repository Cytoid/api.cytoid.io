import { gql } from 'apollo-server-koa'

const scheme = gql`
scalar FileSize
scalar Date

type Query
type Mutation

directive @column(
  name: String
  primary: Boolean
) on FIELD_DEFINITION

directive @toOne(
  name: String!
  field: String
) on FIELD_DEFINITION

directive @toMany(
  name: String!
  field: String!
) on FIELD_DEFINITION

directive @relation(
  name: String!
  select: [String!]
) on FIELD_DEFINITION


type ResourceMetaProperty {
  name: String
  localized_name: String
  url: String
}

type ResourceMeta {
  cover: ResourceMetaProperty
}

enum ResourceState {
  PRIVATE
  PUBLIC
  UNLISTED
}
`

export default scheme
