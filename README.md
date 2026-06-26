# pipeway

> A portable, typed **request pipeline** on Web-standard `Request`/`Response`.
> NestJS-style lifecycle (guards · interceptors · serializers), **zero framework lock-in**.

Runs natively on **Bun · Deno · Cloudflare Workers · Next.js route handlers · Hono**. One thin adapter for **Express / Fastify**.

```ts
import { pipe, ok } from 'pipeway'
import { body } from 'pipeway-steps'
import { z } from 'zod'

export const POST = pipe()
  .use(async (ctx) => ok({ user: await authenticate(ctx.req) })) // guard → typed ctx
  .use(body(z.object({ title: z.string() })))                    // validation → typed body
  .transform((res) => { res.headers.set('x-app', 'pipeway'); return res }) // interceptor
  .handle(({ user, body }) => ({ created: body.title, by: user.id }))
// → (req: Request, params) => Promise<Response>
```

## Why

- **Portable.** Your handler is `(Request) => Response`. Mount it on any Web-standard runtime as-is; no rewrite when you switch from Next to Bun to Workers.
- **NestJS ergonomics, no Nest.** Guards, interceptors, exception filters, serializers — as plain composable functions. No classes, no decorators, no DI container.
- **Order enforced at compile time.** A step that needs `user` in context *cannot* be placed before the step that adds it. TypeScript rejects it.
- **Result-first.** Return a domain `Result<T, E>` and map errors to responses in one place. No exceptions-as-control-flow.

## Compile-time step ordering

```ts
pipe()
  .use(rateLimit)   // ❌ Type error: rateLimit needs { user }, not in context yet
  .use(auth)        //    add auth first
```

The pipeline's context type accumulates as you `.use()`. A step declares what it
*needs*; if the current context doesn't satisfy it, it's a type error — not a
runtime surprise.

## Runtimes

| Runtime | Adapter |
| --- | --- |
| Bun (`Bun.serve`) | none — mount directly |
| Deno (`Deno.serve`) | none |
| Cloudflare Workers | none |
| Next.js route handlers | none |
| Hono | none (`c.req.raw`) |
| **Express / Fastify / Node http** | `pipeway-adapter-node` |

## Packages

| Package | What |
| --- | --- |
| `pipeway` | the pipeline core |
| `pipeway-steps` | generic Zod steps (`body`, `query`) |
| `pipeway-adapter-node` | Express/Fastify/Node bridge |

## Not in scope

Routing · DI container · ORM · its own validation library. pipeway is a pipeline
you mount into your router, not a framework.

## License

MIT © Pierre-Philippe Prévost
