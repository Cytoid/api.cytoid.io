import { SchemaDirectiveVisitor } from 'apollo-server-koa'
import { GraphQLField, GraphQLInterfaceType, GraphQLObjectType } from 'graphql'

export default class SQLJoiner extends SchemaDirectiveVisitor {
  // tslint:disable-next-line:max-line-length
  public visitFieldDefinition(field: GraphQLField<any, any>, details: { objectType: GraphQLObjectType | GraphQLInterfaceType }): GraphQLField<any, any> | void | null {
    console.log(field)
    return null
  }
}
