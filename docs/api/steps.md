# Steps — `pipeway-steps`

Generic validation steps built on the [Standard Schema](https://standardschema.dev)
spec — they accept **any** validator that implements it: Zod 3.24+, Valibot,
ArkType. No lock-in to one library. Auth and rate-limiting are deliberately
**not** bundled — they depend on your stack. Write them yourself as plain
[`Step`](/api/pipe#type-step)s (see the examples below).

```bash
pnpm add pipeway-steps zod   # or valibot, or arktype
```

## `body(schema)` {#body}

```ts
function body<T>(schema: ZodType<T>): Step<{ req: Request }, { body: T }>
```

Reads the request's JSON body, validates it against `schema`, and adds a typed
`ctx.body`. On failure it short-circuits:

| Case | Response |
| --- | --- |
| body is not valid JSON | `400 { "error": "InvalidJson" }` |
| schema rejects | `400 { "error": "ValidationError", "issues": [...] }` |

```ts
import { pipe } from 'pipeway'
import { body } from 'pipeway-steps'
import { z } from 'zod'

const createTodo = pipe()
  .use(body(z.object({ title: z.string().min(1), done: z.boolean().default(false) })))
  .handle(({ body }) => ({ created: body.title, done: body.done }))
//                         ^ body is fully typed
```

## `query(schema)` {#query}

```ts
function query<T>(schema: ZodType<T>): Step<{ req: Request }, { query: T }>
```

Validates the URL search params (as a flat object of strings) against `schema`,
adding a typed `ctx.query`. Same `400 ValidationError` shape on failure. Use
Zod coercion for numbers/booleans:

```ts
import { pipe } from 'pipeway'
import { query } from 'pipeway-steps'
import { z } from 'zod'

const list = pipe()
  .use(query(z.object({ page: z.coerce.number().default(1), q: z.string().optional() })))
  .handle(({ query }) => ({ page: query.page, q: query.q ?? null }))
```

## Writing your own step

A step is just `(ctx) => ok(extra) | fail(response)`. Here is auth:

```ts
import { ok, fail, type Step } from 'pipeway'

export const auth = (): Step<{ req: Request }, { userId: string }> => async (ctx) => {
  const header = ctx.req.headers.get('authorization')
  if (!header) return fail(new Response('Unauthorized', { status: 401 }))
  const userId = await verifyToken(header)
  return userId ? ok({ userId }) : fail(new Response('Unauthorized', { status: 401 }))
}
```

And a rate-limiter that **requires** `userId` (so it must come after `auth` —
the compiler enforces it):

```ts
import { ok, fail, type Step } from 'pipeway'

export const rateLimit =
  (limit: number): Step<{ userId: string }, Record<never, never>> =>
  async (ctx) => {
    const okToProceed = await consume(ctx.userId, limit)
    return okToProceed ? ok({}) : fail(new Response('Too Many Requests', { status: 429 }))
  }
```
