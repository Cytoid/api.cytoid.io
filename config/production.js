module.exports = {
  host: 'cytoid.io',
  postgres: {
    client: 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: '/cloudsql/' + process.env.CLOUD_SQL_CONNECTION_NAME,
    pool: {
      min: 2,
      max: 5
    },
  }
}
