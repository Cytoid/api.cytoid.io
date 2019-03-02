import conf from './conf'
import logger from './logger'
import app from './app'

const port: number = conf.get('port')
const host: string = conf.get('host')
app.listen(port, host, () => {
  logger.info(`Server is running on ${host}:${port}`)
})
