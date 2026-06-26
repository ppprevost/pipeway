# Adapters

A pipeway handler is `(req: Request, params) => Promise<Response>`. Every
Web-standard runtime speaks that already, so **most runtimes need no adapter** —
you mount the handler directly.

## No adapter needed

```ts
// Bun
Bun.serve({ fetch: (req) => handler(req, {}) })

// Deno
Deno.serve((req) => handler(req, {}))

// Cloudflare Workers
export default { fetch: (req) => handler(req, {}) }

// Next.js route handler (app/api/todos/route.ts)
export const POST = (req: Request) => handler(req, {})

// Hono
app.post('/todos', (c) => handler(c.req.raw, c.req.param()))
```

Pass `params` from your router. pipeway does not route; it processes a request
once routed.

## `toNode(handler)` {#tonode}

For the Node `req`/`res` world (Express, Fastify, `http.Server`) — the only
runtimes that don't natively speak Web `Request`/`Response`.

```bash
pnpm add pipeway-adapter-node
```

```ts
function toNode<Params>(
  handler: CompiledHandler<Params>,
): (req: IncomingMessage & { params?: Params }, res: ServerResponse) => Promise<void>
```

It buffers the Node request, converts it to a Web `Request`, runs the handler,
and writes the Web `Response` back to `res`. Path params are read from
`req.params` (Express populates it).

```ts
import express from 'express'
import { pipe, ok } from 'pipeway'
import { toNode } from 'pipeway-adapter-node'

const getTodo = pipe<{ id: string }>().handle(({ params }) => ({ id: params.id }))

const app = express()
app.get('/todos/:id', toNode(getTodo))
app.listen(3000)
```

::: warning Body parsing
`toNode` reads the raw request stream itself. Do **not** put a body parser
(`express.json()`) in front of routes you hand to `toNode`, or the stream will
already be consumed.
:::
