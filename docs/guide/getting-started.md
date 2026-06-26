# Getting started

```bash
pnpm add pipeway pipeway-steps zod
```

## Your first handler

```ts
import { pipe, ok } from 'pipeway'
import { body } from 'pipeway-steps'
import { z } from 'zod'

const createTodo = pipe()
  .use((ctx) => ok({ requestId: crypto.randomUUID() }))
  .use(body(z.object({ title: z.string().min(1) })))
  .handle(({ body, requestId }) => ({ id: requestId, title: body.title }))
```

`createTodo` is a `(req: Request, params) => Promise<Response>`. Mount it anywhere.

## On Bun (no adapter)

```ts
Bun.serve({
  fetch: (req) => createTodo(req, {}),
})
```

## On Express (Node adapter)

```ts
import express from 'express'
import { toNode } from 'pipeway-adapter-node'

express().post('/todos', toNode(createTodo))
```
