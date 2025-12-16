import { Hono } from 'hono'

const app = new Hono()

app.use('*', async (_c, next) => {
  await next()
})

export default app
