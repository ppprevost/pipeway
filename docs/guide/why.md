# Why pipeway

## The problem

Server middleware is either **framework-locked** (Express middleware, Nest
guards, Next route boilerplate) or **all-in** (a whole framework like Hono). When
you move runtimes — Next → Bun, Node → Workers — you rewrite the request layer.

## The idea

A handler is just `(Request) => Response`. That signature is a **standard** every
modern runtime already speaks. Build the request lifecycle on it, and the same
handler runs everywhere.

## What you get

| | pipeway |
| --- | --- |
| Runtime coupling | none (Web standard) |
| Style | functional, composable |
| Guards / interceptors / filters | yes, as steps |
| Compile-time middleware ordering | yes |
| Domain `Result<T, E>` mapping | first-class |
| Routing / DI / ORM | not included (bring your own) |

## Cross-cutting guards (session, rate-limit, BOLA)

The concerns that usually sprawl across a codebase — *who is this, can they call
this, do they own this row* — are all just **steps**. Each one runs in order,
adds typed context, and short-circuits with a `Response` on failure. The compiler
enforces the order: a step that reads `session` cannot be placed before the step
that adds it.

```ts
import { pipe, ok, fail, type Step } from 'pipeway'
import { body } from 'pipeway-steps'
import { z } from 'zod'

// 1. Authentication — adds `session`.
const session = (): Step<{ req: Request }, { session: { userId: string } }> => async (ctx) => {
  const userId = await verify(ctx.req)
  return userId ? ok({ session: { userId } }) : fail(Response.json({ error: 'Unauthorized' }, { status: 401 }))
}

// 2. Rate-limit — REQUIRES `session`, so it can only sit after session().
const rateLimit =
  (key: (ctx: { session: { userId: string } }) => string): Step<{ session: { userId: string } }, Record<never, never>> =>
  async (ctx) => {
    const { success, reset } = await limiter.limit(key(ctx))
    return success ? ok({}) : fail(Response.json({ error: 'RateLimit' }, { status: 429, headers: { 'retry-after': String(reset) } }))
  }

// 3. BOLA / ownership — load the row, prove the caller owns it, hand it down.
// Requires `session` AND `params`, so it cannot run before auth either.
const ownsTodo = (): Step<{ session: { userId: string }; params: { id: string } }, { todo: Todo }> => async (ctx) => {
  const todo = await todos.findById(ctx.params.id)
  if (!todo) return fail(Response.json({ error: 'NotFound' }, { status: 404 }))
  // Return 404, not 403 — don't leak that the id exists to a non-owner.
  if (todo.ownerId !== ctx.session.userId) return fail(Response.json({ error: 'NotFound' }, { status: 404 }))
  return ok({ todo })
}

export const PATCH = pipe<{ id: string }>()
  .use(session())
  .use(rateLimit(({ session }) => `user:${session.userId}`))
  .use(ownsTodo())
  .use(body(z.object({ title: z.string().min(1) })))
  .handle(({ todo, body }) => todos.update(todo.id, body)) // todo is guaranteed owned
```

Why this matters:

- **BOLA is the #1 API risk (OWASP API1).** It happens when an ownership check is
  forgotten on one of fifty endpoints. As a step, the check is a value you *cannot
  forget to thread*: `ctx.todo` only exists if `ownsTodo()` ran, and the handler
  needs `ctx.todo`. Skip the guard and the handler doesn't type-check.
- **Order is a type, not a convention.** `rateLimit` and `ownsTodo` both demand
  `session` in their input type. Put them before `session()` and it's a compile
  error — not a 3am incident where rate-limiting silently keyed on `undefined`.
- **One shape, every route.** The same three steps compose onto every handler in
  any order the types allow, on any runtime. No base controller, no decorator
  metadata, no DI container.

This is the NestJS guard/interceptor lifecycle — `session` ≈ an `AuthGuard`,
`ownsTodo` ≈ a resource guard, `rateLimit` ≈ a `ThrottlerGuard` — but as plain
functions whose ordering the type system checks, with zero framework.

## vs. the neighbours

- **Hono** is a framework (and a great one). pipeway is a *layer* you mount into
  your router — including Hono's.
- **tRPC / ts-rest** are RPC / contract-first. pipeway is middleware-first REST.
- **NestJS** gives you this lifecycle with classes, decorators, and a DI
  container. pipeway gives you the lifecycle as plain functions, nothing else.
