import { SchemaDirectiveVisitor } from 'apollo-server-koa'
import {
  assertListType, assertNonNullType,
  assertObjectType, BooleanValueNode, FieldDefinitionNode, FieldNode,
  GraphQLField,
  GraphQLInterfaceType, GraphQLLeafType, GraphQLList, GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo, ListValueNode, NamedTypeNode, SelectionNode,
  StringValueNode, ValueNode,
} from 'graphql'
import {SelectQueryBuilder} from 'typeorm'

interface SQLField {
  keyPath: string
  relation: boolean
  selections?: string[]
}

export class SQLToOneJoiner extends SchemaDirectiveVisitor {
  protected primaryFields: Map<string, string> = new Map()

  // joinTable.get('graph relation name').get('graph field name')
  protected joinTable: Map<string, Map<string, SQLField>> = new Map()
  protected tableNames: Map<string, string> = new Map()

  public visitFieldDefinition(
    field: GraphQLField<any, any>,
    details: { objectType: GraphQLObjectType | GraphQLInterfaceType },
    ): GraphQLField<any, any> | void | null {
    const tableName = this.args.name
    const propertyFieldName = this.args.field
    const type = field.type as GraphQLObjectType
    assertObjectType(field.type)
    this.join(type, tableName)
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

  protected join(type: GraphQLObjectType, tableName: string) {
    this.tableNames.set(type.name, tableName)
    let joinTable: Map<string, SQLField>
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
        const sqlField: SQLField = {
          keyPath: tableName + '.' + columnName,
          relation: false,
        }
        joinTable.set(subfield.name.value, sqlField)

        const primaryarg = directive.arguments.find((a) => a.name.value === 'primary')
        const isPrimary = primaryarg ? ((primaryarg.value as BooleanValueNode).value) : false
        if (isPrimary) {
          this.primaryFields.set(type.name, subfield.name.value)
        }

        const relationDirective = subfield.directives.find((a) => a.name.value === 'relation')
        if (relationDirective) {
          sqlField.relation = true

          const selectionArg = relationDirective.arguments
            .find((a) => a.name.value === 'select')
          if (selectionArg) {
            const selectionNode = selectionArg.value as ListValueNode
            const selections = (selectionNode.values as ReadonlyArray<StringValueNode>).map((a) => a.value)
            sqlField.selections = selections
          }
          const joinedTableName = relationDirective.arguments.find((a) => a.name.value === 'name')
          const relationField = type.getFields()[subfield.name.value]
          this.join(relationField.type as GraphQLObjectType, (joinedTableName.value as StringValueNode).value)
        }
      }
    }
  }

  protected selectFromFields(qb: SelectQueryBuilder<any>, fieldNode: FieldNode, type: GraphQLObjectType) {
    const selectedFields = fieldNode.selectionSet.selections as ReadonlyArray<FieldNode>
    const fieldTypes = type.getFields()
    for (const field of selectedFields) {
      const sqlField = this.joinTable.get(type.name).get(field.name.value)
      if (!sqlField) {
        continue
      }
      const fieldType = fieldTypes[field.name.value].type as GraphQLObjectType
      if (sqlField.relation) {
        // Has subfields
        const tableName = this.tableNames.get(fieldType.name)
        qb.leftJoin(sqlField.keyPath, tableName)
        if (sqlField.selections) {
          qb.addSelect(sqlField.selections.map((s) => tableName + '.' + s))
        } else {
          this.selectFromFields(qb, field, fieldType)
        }
      } else {
        qb.addSelect(sqlField.keyPath)
      }
    }
  }
}

function orderObjectsByList<OBJ, T>(objects: OBJ[], list: T[], key: string): OBJ[] {
  const map = new Map<T, OBJ>()
  for (const obj of objects) {
    const orderKey: T = (obj as any)[key] as T
    map.set(orderKey, obj)
  }
  return list.map((orderKey) => map.get(orderKey))
}

export class SQLToManyJoiner extends SQLToOneJoiner {
  public visitFieldDefinition(
    field: GraphQLField<any, any>,
    details: { objectType: GraphQLObjectType | GraphQLInterfaceType },
  ): GraphQLField<any, any> | void | null {
    const tableName = this.args.name
    const propertyFieldName = this.args.field
    const type = field.type as GraphQLNonNull<GraphQLList<GraphQLNonNull<GraphQLObjectType>>>
    assertNonNullType(type)
    assertListType(type.ofType)
    assertNonNullType(type.ofType.ofType)
    const objectType = type.ofType.ofType.ofType
    assertObjectType(objectType)
    this.join(objectType, tableName)
    const originalResolve = field.resolve
    field.resolve = (source: any, args: any, context: any, info: GraphQLResolveInfo) => {
      const ids = source[propertyFieldName]
      const qb: SelectQueryBuilder<any> =  originalResolve(source, args, context, info)
      qb.select([])
      this.selectFromFields(
        qb,
        info.fieldNodes.find((f) => f.name.value === info.fieldName),
        objectType)

      const primaryField = this.primaryFields.get(objectType.name)

      // Select primary field
      qb.addSelect(this.joinTable.get(objectType.name).get(primaryField).keyPath)
      return qb
        .whereInIds(ids)
        .getMany()
        .then((objs) => orderObjectsByList(objs, ids, primaryField))
    }
  }
}
