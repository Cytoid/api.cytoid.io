import { SchemaDirectiveVisitor } from 'apollo-server-koa'
import {
  assertListType, assertNonNullType,
  assertObjectType, BooleanValueNode, FieldNode,
  GraphQLField,
  GraphQLInterfaceType, GraphQLList, GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo, ListTypeNode, ListValueNode, NonNullTypeNode,
  StringValueNode,
} from 'graphql'
import {getManager, SelectQueryBuilder} from 'typeorm'

interface ISQLField {
  key: string
  relation: boolean
  relationKey?: string
  selections?: string[]
  many: boolean
}

export class SQLToOneJoiner extends SchemaDirectiveVisitor {
  public db = getManager()
  protected primaryFields: Map<string, string> = new Map()

  // joinTable.get('graph relation name').get('graph field name')
  protected joinTable: Map<string, Map<string, ISQLField>> = new Map()
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
      let qb: SelectQueryBuilder<any> = this.db.createQueryBuilder(tableName, tableName)
      qb.select([])
      this.selectFromFields(
        qb,
        info.fieldNodes.find((f) => f.name.value === info.fieldName),
        type)
      if (propertyFieldName) {
        // If Property Field Name is missing, the task of filtering data would be delegated to the resolver
        qb
          .where({ [this.primaryFields.get(type.name)]: source[propertyFieldName] })
      }
      context.queryBuilder = qb
      qb = originalResolve(source, args, context, info)
      if (!qb) {
        return null
      }
      if (!(qb instanceof SelectQueryBuilder)) {
        return qb
      }
      if (qb.expressionMap.selects.length === 0) {
        return {}
      }
      return qb
        .limit(1)
        .getOne()
    }
  }

  protected join(type: GraphQLObjectType, tableName: string) {
    this.tableNames.set(type.name, tableName)
    let joinTable: Map<string, ISQLField>
    if (this.joinTable.has(type.name)) {
      joinTable = this.joinTable.get(type.name)
    } else {
      joinTable = new Map()
      this.joinTable.set(type.name, joinTable)
    }

    for (const subfield of type.astNode.fields) {
      const columnDirective = subfield.directives.find((a) => a.name.value === 'column')
      const reverseRelationDirective = subfield.directives.find((a) => a.name.value === 'reverseRelation')
      if (columnDirective) {
        const dirarg = columnDirective.arguments.find((a) => a.name.value === 'name')
        const columnName = dirarg ? ((dirarg.value as StringValueNode).value) : subfield.name.value
        const sqlField: ISQLField = {
          key: columnName,
          relation: false,
          many: false,
        }
        joinTable.set(subfield.name.value, sqlField)

        const primaryarg = columnDirective.arguments.find((a) => a.name.value === 'primary')
        const isPrimary = primaryarg ? ((primaryarg.value as BooleanValueNode).value) : false
        if (isPrimary) {
          this.primaryFields.set(type.name, subfield.name.value)
        }

        const relationDirective = subfield.directives.find((a) => a.name.value === 'relation')
        if (relationDirective) {
          sqlField.relation = true
          const joinedTableName = relationDirective.arguments.find((a) => a.name.value === 'name')
          const relationField = type.getFields()[subfield.name.value]
          const relationFieldType = relationField.type as GraphQLObjectType

          const selectionArg = relationDirective.arguments
            .find((a) => a.name.value === 'select')
          if (selectionArg) {
            const selectionNode = selectionArg.value as ListValueNode
            const selections = (selectionNode.values as ReadonlyArray<StringValueNode>).map((a) => a.value)
            sqlField.selections = selections
          }

          const relationFieldArg = relationDirective.arguments
            .find((a) => a.name.value === 'field')
          if (relationFieldArg) {
            const node = relationFieldArg.value as StringValueNode
            sqlField.relationKey = node.value
            relationField.resolve = (parent: any) => {
              if (parent[sqlField.relationKey]) {
                return parent[sqlField.relationKey]
              }
              if (parent[sqlField.key]) {
                return {[this.primaryFields.get(relationFieldType.name)]: parent[sqlField.key]}
              }
            }
          } else {
            sqlField.relationKey = sqlField.key
          }
          this.join(relationFieldType, (joinedTableName.value as StringValueNode).value)
        }
      } else if (reverseRelationDirective) {
        const nameArg = reverseRelationDirective.arguments.find((a) => a.name.value === 'name')
        const columnName = nameArg ? ((nameArg.value as StringValueNode).value) : subfield.name.value
        const relationField = type.getFields()[subfield.name.value]
        const relationFieldType = (relationField.type as GraphQLNonNull<GraphQLList<GraphQLNonNull<GraphQLObjectType>>>)
        assertNonNullType(relationFieldType)
        assertListType(relationFieldType.ofType)
        assertNonNullType(relationFieldType.ofType.ofType)
        const relationObjectType = relationFieldType.ofType.ofType.ofType
        assertObjectType(relationObjectType)
        const sqlField: ISQLField = {
          key: columnName,
          relation: true,
          relationKey: columnName,
          many: true,
        }
        joinTable.set(subfield.name.value, sqlField)
        this.join(relationObjectType, (nameArg.value as StringValueNode).value)
      }
    }
  }

  protected selectFromFields(qb: SelectQueryBuilder<any>, fieldNode: FieldNode, type: GraphQLObjectType) {
    const selectedFields = fieldNode.selectionSet.selections as ReadonlyArray<FieldNode>
    const fieldTypes = type.getFields()
    const tableName = this.tableNames.get(type.name)
    for (const field of selectedFields) {
      const sqlField = this.joinTable.get(type.name).get(field.name.value)
      if (!sqlField) {
        continue
      }

      if (sqlField.relation) {
        if (sqlField.many) {
          const fieldType = fieldTypes[field.name.value].type as GraphQLNonNull<
            GraphQLList<GraphQLNonNull<GraphQLObjectType>>
          >
          const objectType = fieldType.ofType.ofType.ofType
          const subtypeTableName = this.tableNames.get(objectType.name)
          if (field.selectionSet.selections.length === 0) {
            continue
          }
          qb.leftJoin(tableName + '.' + sqlField.relationKey, subtypeTableName)
          this.selectFromFields(qb, field, objectType)
        } else {
          // Has subfields
          const fieldType = fieldTypes[field.name.value].type as GraphQLObjectType
          const subtypeTableName = this.tableNames.get(fieldType.name)
          if (field.selectionSet.selections.length === 0) {
            continue
          }
          if (field.selectionSet.selections.length === 1 &&
            (field.selectionSet.selections[0] as FieldNode).name.value === this.primaryFields.get(fieldType.name)) {
            // Simplify query
            qb.addSelect(tableName + '.' + sqlField.key)
            continue
          }
          qb.leftJoin(tableName + '.' + sqlField.relationKey, subtypeTableName)
          if (sqlField.selections) {
            // Allowing the selections=["aaa", "bbb"] directive argument
            qb.addSelect(sqlField.selections.map((s) => subtypeTableName + '.' + s))
          } else {
            this.selectFromFields(qb, field, fieldType)
          }
        }
      } else {
        qb.addSelect(tableName + '.' + sqlField.key)
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
      let qb: SelectQueryBuilder<any> = this.db.createQueryBuilder(tableName, tableName)
      qb.select([])
      this.selectFromFields(
        qb,
        info.fieldNodes.find((f) => f.name.value === info.fieldName),
        objectType)

      const primaryField = this.primaryFields.get(objectType.name)

      // Select primary field
      qb.addSelect(tableName + '.' + this.joinTable.get(objectType.name).get(primaryField).key)
        .whereInIds(ids)
      context.queryBuilder = qb
      qb = originalResolve(source, args, context, info)
      if (qb) {
        return qb.getMany()
          .then((objs: any) => orderObjectsByList(objs, ids, primaryField))
      } else {
        return null
      }

    }
  }
}
