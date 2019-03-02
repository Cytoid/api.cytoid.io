import winston = require('winston')
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
  ),
  transports: [
    new winston.transports.Console({
      level: 'debug',
      handleExceptions: true,
    })
  ]
})
export default logger
