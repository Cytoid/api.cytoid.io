module.exports = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  secret: 'keyboard cat',
  postgres: {
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgres://cytoid:cytoid@localhost:5432/cytoid',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  apiURL: 'https://api.cytoid.io',
  assetsURL: 'https://assets.cytoid.io',
  webURL: 'http://localhost:8080',
}
