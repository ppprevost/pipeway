// Bun needs NO adapter: Bun.serve speaks Web-standard Request/Response.
// Run: bun examples/bun/server.ts
import { pipe, ok } from 'pipeway'
import { body } from 'pipeway-steps'
import { z } from 'zod'

const createTodo = pipe()
  .use(() => ok({ requestId: crypto.randomUUID() }))
  .use(body(z.object({ title: z.string().min(1) })))
  .transform((res, ctx) => {
    res.headers.set('x-request-id', ctx.requestId)
    return res
  })
  .handle(({ body, requestId }) => ({ id: requestId, title: body.title }))

Bun.serve({
  port: 3000,
  fetch(req) {
    if (req.method === 'POST' && new URL(req.url).pathname === '/todos') {
      return createTodo(req, {})
    }
    return new Response('Not found', { status: 404 })
  },
})

console.log('pipeway on Bun → http://localhost:3000/todos')
