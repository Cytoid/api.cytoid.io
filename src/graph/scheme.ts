import { gql } from 'apollo-server-koa'

const scheme = gql`
scalar FileSize
scalar Date
scalar Long

type Query
type Mutation

directive @reverseRelation(
  name: String!
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
