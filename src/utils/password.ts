import PasswordHash, {
	Scrypt,
	Bcrypt,
	RegisterHasher,
} from 'unihash'

RegisterHasher(Scrypt, 0x00)
RegisterHasher(Bcrypt, 0x01)

const hasher = new PasswordHash(Scrypt)
export default hasher
