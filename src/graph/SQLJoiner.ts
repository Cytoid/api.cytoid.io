import { SchemaDirectiveVisitor } from 'apollo-server-koa'
import { gql } from 'apollo-server-koa'
import {
  assertListType, assertNonNullType,
  assertObjectType, BooleanValueNode, FieldNode, FragmentSpreadNode,
  GraphQLField,
  GraphQLInterfaceType, GraphQLList, GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo, ListTypeNode, ListValueNode, NonNullTypeNode, SelectionNode,
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

export const typeDefs = gql`directive @column(
  name: String
  primary: Boolean
) on FIELD_DEFINITION

directive @toOne(
  name: String!
  field: String
) on FIELD_DEFINITION

directive @toMany(
  name: String!
  field: String
) on FIELD_DEFINITION

directive @relation(
  name: String!
  field: String
  select: [String!]
) on FIELD_DEFINITION`

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

      const selector = new Selector(qb, info, this.primaryFields, this.joinTable, this.tableNames)
      selector.select(
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
      return selector.getOne()
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
}

function orderObjectsByList<OBJ, T>(objects: OBJ[], list: T[], key: string): OBJ[] {
  const map = new Map<T, OBJ>()
  for (const obj of objects) {
    const orderKey: T = (obj as any)[key] as T
    map.set(orderKey, obj)
  }
  const newList: OBJ[] = []
  for (const orderKey of list) {
    const obj = map.get(orderKey)
    if (obj) {
      newList.push(obj)
    }
  }
  return newList
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
      const ids = propertyFieldName && source[propertyFieldName]
      if (ids && ids.length === 0) {
        return []
      }
      let qb: SelectQueryBuilder<any> = this.db.createQueryBuilder(tableName, tableName)
      qb.select([])
      const selector = new Selector(qb, info, this.primaryFields, this.joinTable, this.tableNames)
      selector.select(
        info.fieldNodes.find((f) => f.name.value === info.fieldName),
        objectType)

      const primaryField = this.primaryFields.get(objectType.name)

      // Select primary field
      qb.addSelect(tableName + '.' + this.joinTable.get(objectType.name).get(primaryField).key)
      if (ids) {
        qb.whereInIds(ids)
      }
      context.queryBuilder = qb
      qb = originalResolve(source, args, context, info)
      if (qb) {
        if (ids) {
          return selector.getMany()
            .then((objs: any) => orderObjectsByList(objs, ids, primaryField))
        } else {
          return selector.getMany()
        }
      } else {
        return null
      }
    }
  }
}

export class Selector {
  protected primaryFields: Map<string, string>
  protected joinTable: Map<string, Map<string, ISQLField>>
  protected tableNames: Map<string, string>

  private qb: SelectQueryBuilder<any>
  private info: GraphQLResolveInfo

  private aggregated: Set<string> = new Set()

  constructor(
    qb: SelectQueryBuilder<any>,
    info: GraphQLResolveInfo,
    primaryFields: Map<string, string>,
    joinTable: Map<string, Map<string, ISQLField>>,
    tableNames: Map<string, string>) {
    this.qb = qb
    this.info = info
    this.primaryFields = primaryFields
    this.joinTable = joinTable
    this.tableNames = tableNames
  }

  public async getOne(): Promise<any | undefined> {
    const { entities, raw } = await this.qb.limit(1).getRawAndEntities()
    if (entities.length === 0) {
      return undefined
    }
    const entity = entities[0]
    const r = raw[0]
    for (const tableName of this.aggregated) {
      entity[tableName] = r[tableName]
    }
    return entity
  }

  public async getMany(): Promise<any[]> {
    const { entities, raw } = await this.qb.getRawAndEntities()
    entities.forEach((entity, index) => {
      const r = raw[index]
      for (const tableName of this.aggregated) {
        entity[tableName] = r[tableName]
      }
    })
    return entities
  }

  public select(
    fieldNode: FieldNode,
    type: GraphQLObjectType) {
    this.selectFromFields(fieldNode, type)
    if (this.aggregated.size === 0) {
      return
    }
    for (const alias of this.qb.expressionMap.aliases) {
      if (this.aggregated.has(alias.name)) {
        continue
      }
      for (const primary of alias.metadata.primaryColumns) {
        this.qb.addGroupBy(alias.name + '.' + primary.propertyName)
      }
    }
    if (this.aggregated.size > 0) {

      const tableName = this.tableNames.get(type.name)
      const primary = this.primaryFields.get(type.name)
      const sqlField = this.joinTable.get(type.name).get(primary).key
      this.qb.addGroupBy(tableName + '.' + sqlField)
    }
  }

  protected selectJSONFields(
    fieldNode: FieldNode,
    type: GraphQLObjectType) {
    const selectedFields: FieldNode[] = []
    for (const selection of fieldNode.selectionSet.selections) {
      this.spreadFields(selectedFields, selection)
    }

    const fieldTypes = type.getFields()
    const tableName = this.tableNames.get(type.name)
    const jsonFields = []
    for (const field of selectedFields) {
      const sqlField = this.joinTable.get(type.name).get(field.name.value)
      if (!sqlField) {
        continue
      }

      if (sqlField.relation) {
        console.error('Does not support relation in toMany')
      } else {
        jsonFields.push(`'${sqlField.key}',"${tableName}"."${sqlField.key}"`)
      }
    }
    this.qb.addSelect(`json_agg(json_build_object(${jsonFields.join(',')})) as ${tableName}`)
    this.aggregated.add(tableName)
  }

  protected selectFromFields(
    fieldNode: FieldNode,
    type: GraphQLObjectType) {
    const selectedFields: FieldNode[] = []
    for (const selection of fieldNode.selectionSet.selections) {
      this.spreadFields(selectedFields, selection)
    }

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
          this.qb.leftJoin(tableName + '.' + sqlField.relationKey, subtypeTableName)
          this.selectJSONFields(field, objectType)
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
            this.qb.addSelect(tableName + '.' + sqlField.key)
            continue
          }
          this.qb.leftJoin(tableName + '.' + sqlField.relationKey, subtypeTableName)
          if (sqlField.selections) {
            // Allowing the selections=["aaa", "bbb"] directive argument
            this.qb.addSelect(sqlField.selections.map((s) => subtypeTableName + '.' + s))
          } else {
            this.selectFromFields(field, fieldType)
          }
        }
      } else {
        this.qb.addSelect(tableName + '.' + sqlField.key)
      }
    }
  }

  protected spreadFields(arr: FieldNode[], node: SelectionNode) {
    if (node.kind === 'Field') {
      const fieldNode = node as FieldNode
      arr.push(fieldNode)
    } else if (node.kind === 'FragmentSpread') {
      const fragmentSpread = node as FragmentSpreadNode
      for (const subSelection of this.info.fragments[fragmentSpread.name.value].selectionSet.selections) {
        this.spreadFields(arr, subSelection)
      }
    }
  }
}
