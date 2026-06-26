<p align="center">
  <img src="docs/public/favicon.svg" width="72" alt="pipeway" />
</p>

<h1 align="center">pipeway</h1>

<p align="center">
  A portable, typed <strong>request pipeline</strong> on Web-standard <code>Request</code>/<code>Response</code>.<br/>
  NestJS-style lifecycle (guards · interceptors · serializers), <strong>zero framework lock-in</strong>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pipeway"><img src="https://img.shields.io/npm/v/pipeway?color=6366f1&label=pipeway" alt="npm" /></a>
  <a href="https://github.com/ppprevost/pipeway/actions/workflows/ci.yml"><img src="https://github.com/ppprevost/pipeway/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ppprevost/pipeway/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/pipeway?color=6366f1" alt="MIT" /></a>
</p>

<p align="center">
  <strong><a href="https://ppprevost.github.io/pipeway/">📚 Documentation</a></strong>
  &nbsp;·&nbsp;
  <a href="https://ppprevost.github.io/pipeway/guide/getting-started">Getting started</a>
  &nbsp;·&nbsp;
  <a href="https://ppprevost.github.io/pipeway/api/">API reference</a>
</p>

---

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
| `pipeway` | the pipeline core (`use` · `map` · `catch` · `serialize` · `transform` · `handle` · `json`) |
| `pipeway-steps` | Standard Schema steps — `body`, `query` (Zod / Valibot / ArkType) |
| `pipeway-adapter-node` | Express/Fastify/Node bridge |
| `pipeway-client` | portable Result-first REST client |
| `pipeway-react` | React hooks (`useQuery`, `useMutation`) over the client |
| `pipeway-next` | typed pipeline for Next.js server actions |

## Not in scope

Routing · DI container · ORM · its own validation library. pipeway is a pipeline
you mount into your router, not a framework.

## License

MIT © Pierre-Philippe Prévost
