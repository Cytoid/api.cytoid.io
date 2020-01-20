export default function OrderObjectsByList<OBJ, T>(objects: OBJ[], list: T[], key: string): OBJ[] {
  const map = new Map<T, OBJ>()
  for (const obj of objects) {
    const orderKey: T = (obj as any)[key] as T
    map.set(orderKey, obj)
  }
  return list.map((orderKey) => map.get(orderKey))
}
