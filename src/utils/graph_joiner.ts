import {FieldNode, GraphQLResolveInfo} from 'graphql'
import {SelectQueryBuilder} from 'typeorm'

function fieldNames(info: GraphQLResolveInfo) {
  const query = info.fieldNodes.find((field) => field.name.value === info.fieldName)
  return query.selectionSet.selections
    .filter((selection) => selection.kind === 'Field') as [FieldNode]
}

export function GraphQLJoin<PK, Entity>(
  info: GraphQLResolveInfo,
  qb: SelectQueryBuilder<Entity>,
  primaryKey: string,
  value: PK) {
  const fields = fieldNames(info).map((selection) => selection.name.value)
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
  values: [PK]) {
  const fields = fieldNames(info).map((selection) => selection.name.value)
  if (fields.length === 0) {
    return []
  }
  if (fields.length === 1 && fields[0] === primaryKey) {
    return values.map((id) => ({ [primaryKey]: id }))
  }
  qb.select(fields.map((f) => qb.alias + '.' + f))
    .whereInIds(values)
  return null
}

export function GraphQLJoinProperty<PK, Entity>(
  info: GraphQLResolveInfo,
  qb: SelectQueryBuilder<Entity>,
  keypath: string,
  primaryKey: string,
  foreignKey: string,
  alias: string) {
  const keys = keypath.split('.')
  let fieldNodes: [FieldNode] = info.fieldNodes
    .find((field) => field.name.value === info.fieldName)
    .selectionSet
    .selections
    .filter((selection) => selection.kind === 'Field') as [FieldNode]

  for (const key of keys) {
    const fieldNode = fieldNodes.find((f) => (f.name.value === key))
    if (!fieldNode) {
      return
    }
    fieldNodes = fieldNode
      .selectionSet
      .selections
      .filter((selection) => selection.kind === 'Field') as [FieldNode]
  }
  const fields = fieldNodes.map((f) => f.name.value)
  if (fields.length === 0) {
    return
  } else if (fields.length === 1 && fields[0] === primaryKey) {
    return
  } else {
    qb.leftJoin(foreignKey, alias)
      .addSelect(fields.map((f) => alias + '.' + f))
  }
}
