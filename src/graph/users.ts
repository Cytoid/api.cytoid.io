import { gql } from 'apollo-server-koa'
import Email from '../models/email'
import User from '../models/user'

export const typeDefs = gql`
type Email {
  address: String!
  verified: Boolean!
}

type User {
  id: ID!
  uid: String
  name: String
  email: Email
  registrationDate: Date
  role: String!
  avatarURL: String!
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
