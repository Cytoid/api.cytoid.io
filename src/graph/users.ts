import User from '../models/user'

export const resolvers = {
  User: {
    email(parent: User) {
      return parent.emailObj
    },
  },
}
