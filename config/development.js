module.exports = {
  host: 'localhost',
  port: 3000,
  postgres: {
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://cytoid:cytoid@localhost:5432/cytoid',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  apiURL: 'https://api.cytoid.io',
  assetsURL: 'https://assets.cytoid.io',
  webURL: 'http://localhost:8080',
  functionURL: 'http://localhost:5000',
  gravatarURL: 'https://www.gravatar.com/avatar',
  email: {
    secretKey: 'sendgrid secret',
    sender: {
      email: 'mailbot@example.com',
      name: 'mailbot'
    },
    replyTo: {
      email: 'admin@example.com',
      name: 'admin'
    },
    templates: {}
  }
}
