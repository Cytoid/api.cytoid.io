import { types } from 'pg'
import { parse as pgParseArray } from 'postgres-array'
import {Connection} from 'typeorm'
import logger from './logger'
interface ITypeInfo {
  typname: string
  oid: number
  typarray: number
}
type TypeParser = (value: string | null) => any
type RegisterFunc = (oid: number, parseFn: TypeParser) => void
const parsers: { [key: string]: (oid: ITypeInfo, register: RegisterFunc) => void } = {
  citext(oid, register) {
    register(oid.typarray, pgParseArray)
  },
}
export default async function registerParsers(db: Connection) {
  const keys = Object.keys(parsers)
  const paramStr = Array.from(Array(keys.length).keys()).map((a) => '$' + (a + 1)).join(',')
  return db
    .query(`SELECT typname, oid, typarray FROM pg_type WHERE typname in (${paramStr})`, keys)
    .then((typeInfos: [ITypeInfo]) => {
      for (const info of typeInfos) {
        parsers[info.typname](info, types.setTypeParser)
      }
    })
}
