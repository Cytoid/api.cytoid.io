const config = require('config')

const models = require('./dist/models')


module.exports = {
  ...config.postgres,
  entities: Object.values(models),
  migrations: ['migrations/*.js'],
  cli: {
    entitiesDir: 'src/models',
    migrationsDir: 'migrations'
  }
}
