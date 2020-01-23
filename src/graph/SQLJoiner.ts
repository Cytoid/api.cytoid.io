import { SchemaDirectiveVisitor } from 'apollo-server-koa'
import {
  assertObjectType, BooleanValueNode, FieldNode,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLResolveInfo,
  StringValueNode,
} from 'graphql'
import {SelectQueryBuilder} from 'typeorm'

export default class SQLJoiner extends SchemaDirectiveVisitor {
  // tslint:disable-next-line:max-line-length
  public visitFieldDefinition(field: GraphQLField<any, any>, details: { objectType: GraphQLObjectType | GraphQLInterfaceType }): GraphQLField<any, any> | void | null {
    const tableName = this.args.name
    const propertyFieldName = this.args.field
    assertObjectType(field.type)
    const type = field.type as GraphQLObjectType

    const fieldToColumnMapping = new Map()
    let primaryField: string = null
    for (const subfield of type.astNode.fields) {
      const directive = subfield.directives.find((a) => a.name.value === 'column')
      if (directive) {
        const dirarg = directive.arguments.find((a) => a.name.value === 'name')
        const columnName = dirarg ? ((dirarg.value as StringValueNode).value) : subfield.name.value
        fieldToColumnMapping.set(subfield.name.value, columnName)

        const primaryarg = directive.arguments.find((a) => a.name.value === 'primary')
        const isPrimary = primaryarg ? ((primaryarg.value as BooleanValueNode).value) : false
        if (isPrimary) {
          primaryField = subfield.name.value
        }
      }
    }

    const originalResolve = field.resolve
    field.resolve = (source: any, args: any, context: any, info: GraphQLResolveInfo) => {
      const columnFields = info.fieldNodes.find((f) => f.name.value === info.fieldName)
      const columns = columnFields.selectionSet.selections
        .map((selection) => fieldToColumnMapping.get((selection as FieldNode).name.value))
        .filter((a) => !!a)
      const qb: SelectQueryBuilder<any> =  originalResolve(source, args, context, info)

      if (columns.length === 0) {
        return {}
      } else if (columns.length === 1 && columns[0] === fieldToColumnMapping.get(primaryField)) {
        console.log('simplified query')
        return {[primaryField]: source[propertyFieldName]}
      }

      return qb.select(columns.map((col) => tableName + '.' + col))
        .where({ [fieldToColumnMapping.get(primaryField)]: source[propertyFieldName] })
        .getOne()
    }
  }
}
