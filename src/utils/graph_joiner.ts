import {FieldNode, GraphQLResolveInfo} from 'graphql'
import {SelectQueryBuilder} from 'typeorm'

export function GraphQLFieldNames(info: GraphQLResolveInfo) {
  const query = info.fieldNodes.find((field) => field.name.value === info.fieldName)
  return query.selectionSet.selections
    .filter((selection) => selection.kind === 'Field') as [FieldNode]
}

export function GraphQLFieldNamesForKeyPath(info: GraphQLResolveInfo, keypath: string) {
  const keys = keypath.split('.')
  let fieldNodes: [FieldNode] = info.fieldNodes
    .find((field) => field.name.value === info.fieldName)
    .selectionSet
    .selections
    .filter((selection) => selection.kind === 'Field') as [FieldNode]

  for (const key of keys) {
    const fieldNode = fieldNodes.find((f) => (f.name.value === key))
    if (!fieldNode) {
      return null
    }
    fieldNodes = fieldNode
      .selectionSet
      .selections
      .filter((selection) => selection.kind === 'Field') as [FieldNode]
  }
  return fieldNodes
}

export function GraphQLJoin<PK, Entity>(
  info: GraphQLResolveInfo,
  qb: SelectQueryBuilder<Entity>,
  primaryKey: string,
  value: PK,
  fieldFilter: ((fields: string[]) => string[]) = null) {
  let fields = GraphQLFieldNames(info)
    .map((selection) => selection.name.value)
    .filter((f) => !f.startsWith('__'))
  if (fieldFilter) {
    fields = fieldFilter(fields)
  }
  if (fields.length === 0) {
    return {}
  }
  if (fields.length === 1 && fields[0] === primaryKey) {
    return { [primaryKey]: value }
  }
  qb.select(fields.map((f) => qb.alias + '.' + f))
    .where({ [primaryKey]: value })
  return null
}

export function GraphQLJoinMany<PK, Entity>(
  info: GraphQLResolveInfo,
  qb: SelectQueryBuilder<Entity>,
  primaryKey: string,
  values: PK[],
  fieldFilter: ((fields: string[]) => string[]) = null) {
  let fields = GraphQLFieldNames(info)
    .map((selection) => selection.name.value)
    .filter((f) => !f.startsWith('__'))
  if (fieldFilter) {
    fields = fieldFilter(fields)
  }
  if (fields.length === 0) {
    return []
  }
  if (fields.length === 1 && fields[0] === primaryKey) {
    return values.map((id) => ({ [primaryKey]: id }))
  }
  qb.select(fields.map((f) => qb.alias + '.' + f))
    .addSelect(qb.alias + '.' + primaryKey)
    .whereInIds(values)
  return null
}

export function GraphQLJoinProperty<PK, Entity>(
  info: GraphQLResolveInfo,
  qb: SelectQueryBuilder<Entity>,
  keypath: string,
  primaryKey: string,
  foreignKey: string,
  alias: string,
  fieldFilter: ((fields: string[]) => string[]) = null) {
  const fieldNodes = GraphQLFieldNamesForKeyPath(info, keypath)
  if (!fieldNodes) {
    return
  }
  let fields = fieldNodes
    .map((f) => f.name.value)
    .filter((f) => !f.startsWith('__'))

  if (fieldFilter) {
    fields = fieldFilter(fields)
  }

  if (fields.length === 0) {
    return
  } else if (fields.length === 1 && fields[0] === primaryKey) {
    return
  } else {
    qb.leftJoin(foreignKey, alias)
      .addSelect(fields.map((f) => alias + '.' + f))
  }
}
