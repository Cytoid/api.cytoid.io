import { gql } from 'apollo-server-koa'
import Email from '../models/email'
import User from '../models/user'

export const typeDefs = gql`
type Email {
  address: String! @column(primary: true)
  verified: Boolean! @column
}

type User {
  id: ID! @column(primary: true)
  uid: String @column
  name: String @column
  email: Email @column(name: "emailObj") @relation(name: "emails")
  registrationDate: Date @column
  role: String! @column
  avatarURL: String! @column(name: "avatarPath")
}
`

export const resolvers = {
  User: {
    email(parent: User) {
      return parent.emailObj
    },
  },
}

export function FitUserEmail(user: User) {
  if (!user) {
    return user
  }
  user.emailObj = user.emailObj || {} as Email
  user.emailObj.address = user.emailObj.address || user.email
  return user
}
