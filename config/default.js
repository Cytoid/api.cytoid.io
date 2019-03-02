module.exports = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  postgres: {
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgres://cytoid:cytoid@localhost:5432/cytoid',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  }
}
