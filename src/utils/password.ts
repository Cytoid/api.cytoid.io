import PasswordHash, {
  Bcrypt,
  RegisterHasher,
  Scrypt,
} from 'unihash'

RegisterHasher(Scrypt, 0x00)
RegisterHasher(Bcrypt, 0x01)

const hasher = new PasswordHash(Scrypt)
export default hasher
