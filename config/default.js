module.exports = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  secret: 'keyboard cat',
  jwtSecret: 'another keyboard cat',
  apiURL: 'https://api.cytoid.io',
  assetsURL: 'https://assets.cytoid.io',
  webURL: 'http://localhost:8080',
  gravatarURL: 'https://www.gravatar.com/avatar',
  emailSender: {
    name: 'Cytoid',
    email: 'robot@cytoid.io',
  },
  emailReplyTo: {
    name: 'Cytoid Support',
    email: 'support@cytoid.io',
  },
}
