import { SchemaDirectiveVisitor } from 'apollo-server-koa'
import {
  assertObjectType, BooleanValueNode, FieldDefinitionNode, FieldNode,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLResolveInfo, NamedTypeNode, SelectionNode,
  StringValueNode,
} from 'graphql'
import {SelectQueryBuilder} from 'typeorm'

export default class SQLJoiner extends SchemaDirectiveVisitor {
  private primaryFields: Map<string, string> = new Map()

  // joinTable.get('graph relation name').get('graph field name')
  private joinTable: Map<string, Map<string, string>> = new Map()
  private tableNames: Map<string, string> = new Map()

  private join(type: GraphQLObjectType, tableName: string) {
    this.tableNames.set(type.name, tableName)
    let joinTable: Map<string, string>
    if (this.joinTable.has(type.name)) {
      joinTable = this.joinTable.get(type.name)
    } else {
      joinTable = new Map()
      this.joinTable.set(type.name, joinTable)
    }

    for (const subfield of type.astNode.fields) {
      const directive = subfield.directives.find((a) => a.name.value === 'column')
      if (directive) {
        const dirarg = directive.arguments.find((a) => a.name.value === 'name')
        const columnName = dirarg ? ((dirarg.value as StringValueNode).value) : subfield.name.value
        joinTable.set(subfield.name.value, tableName + '.' + columnName)

        const primaryarg = directive.arguments.find((a) => a.name.value === 'primary')
        const isPrimary = primaryarg ? ((primaryarg.value as BooleanValueNode).value) : false
        if (isPrimary) {
          this.primaryFields.set(type.name, subfield.name.value)
        }

        const relationDirective = subfield.directives.find((a) => a.name.value === 'relation')
        if (relationDirective) {
          const joinedTableName = relationDirective.arguments.find((a) => a.name.value === 'name')
          const relationField = type.getFields()[subfield.name.value]
          this.join(relationField.type as GraphQLObjectType, (joinedTableName.value as StringValueNode).value)
        }
      }
    }
  }

  private selectFromFields(qb: SelectQueryBuilder<any>, fieldNode: FieldNode, type: GraphQLObjectType) {
    const selectedFields = fieldNode.selectionSet.selections as ReadonlyArray<FieldNode>
    for (const field of selectedFields) {
      const fieldKeypath = this.joinTable.get(type.name).get(field.name.value)
      if (field.selectionSet) {
        // Has subfields
        const newtype = type.getFields()[field.name.value].type as GraphQLObjectType
        const tableName = this.tableNames.get(newtype.name)
        qb.leftJoin(fieldKeypath, tableName)
        this.selectFromFields(qb, field, newtype)
      } else {
        qb.addSelect(fieldKeypath)
      }
    }
  }
  // tslint:disable-next-line:max-line-length
  public visitFieldDefinition(field: GraphQLField<any, any>, details: { objectType: GraphQLObjectType | GraphQLInterfaceType }): GraphQLField<any, any> | void | null {
    const tableName = this.args.name
    const propertyFieldName = this.args.field
    const type = field.type as GraphQLObjectType
    assertObjectType(field.type)
    this.join(field.type as GraphQLObjectType, tableName)
    const originalResolve = field.resolve
    field.resolve = (source: any, args: any, context: any, info: GraphQLResolveInfo) => {
      const qb: SelectQueryBuilder<any> =  originalResolve(source, args, context, info)
      qb.select([])
      this.selectFromFields(
        qb,
        info.fieldNodes.find((f) => f.name.value === info.fieldName),
        type)
      return qb
        .where({ [this.primaryFields.get(type.name)]: source[propertyFieldName] })
        .getOne()
    }
  }
}
