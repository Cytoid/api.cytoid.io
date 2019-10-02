import { AccessControl } from 'accesscontrol'

const ac = new AccessControl()

ac.grant('user')
ac.grant('moderator').extend('user')
ac.grant('admin').extend('moderator')

export default ac
