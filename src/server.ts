import 'reflect-metadata' // this shim is required
import { createExpressServer } from 'routing-controllers'
import conf from './conf'

import * as controllers from './controllers'

const app = createExpressServer({
  controllers: Object.values(controllers),
})

const port: number = conf.get('port')
const host: string = conf.get('host')
app.listen(port, host, () => {
  console.log(`Server is running on ${host}:${port}`)
})
