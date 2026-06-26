// The SAME handler, on Express, via the Node adapter.
// Run: pnpm --filter @pipeway/example-express start
import express from 'express'
import { pipe, ok } from 'pipeway'
import { toNode } from 'pipeway-adapter-node'
import { body } from 'pipeway-steps'
import { z } from 'zod'

const createTodo = pipe()
  .use((ctx) => ok({ requestId: crypto.randomUUID() }))
  .use(body(z.object({ title: z.string().min(1) })))
  .transform((res, ctx) => {
    res.headers.set('x-request-id', ctx.requestId)
    return res
  })
  .handle(({ body, requestId }) => ({ id: requestId, title: body.title }))

const app = express()
app.post('/todos', toNode(createTodo))
app.listen(3000, () => console.log('pipeway on Express → http://localhost:3000/todos'))
