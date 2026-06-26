# `pipe()`

The pipeline builder. Immutable and chainable: every method returns a new
pipeline, so builders are safe to share and extend.

## `pipe(options?)` {#pipe-fn}

```ts
function pipe<Params = {}, E = never>(options?: PipeOptions<E>): Pipeline
```

Creates an empty pipeline.

- **`Params`** — the shape of the route params your runtime/router injects
  (e.g. `pipe<{ id: string }>()`). Defaults to `{}`.
- **`E`** — the domain error type a handler may return via [`Result`](/api/result).
  Inferred; set it when you use `onResult`.
- **`options`** — see [`PipeOptions`](#type-pipeoptions).

```ts
import { pipe } from 'pipeway'

const handler = pipe().handle(() => ({ ok: true }))
//    (req: Request, params: {}) => Promise<Response>
```

With params and an error mapper:

```ts
const getUser = pipe<{ id: string }, 'NotFound'>({
  onResult: (e) => new Response(e, { status: 404 }),
}).handle(/* ... */)
```

## `.use(step)` {#use}

```ts
use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never): Pipeline
```

Appends a [step](#type-step). The step declares what it **needs** in context
(`Need`) and what it **adds** (`Extra`). The added keys become available to every
later step and to the handler.

```ts
import { pipe, ok } from 'pipeway'

pipe()
  .use((ctx) => ok({ requestId: crypto.randomUUID() })) // adds requestId
  .use((ctx) => ok({ at: Date.now() }))                 // ctx already has requestId
  .handle((ctx) => ({ requestId: ctx.requestId, at: ctx.at }))
```

### Compile-time ordering

If a step needs a key that isn't in context yet, the `.use()` call is a **type
error** — not a runtime surprise:

```ts
import { pipe, ok, type Step } from 'pipeway'

const requireAdmin: Step<{ user: { admin: boolean } }, { admin: true }> =
  (ctx) => ok({ admin: true as const })

pipe()
  .use(requireAdmin) // ❌ Type error: `user` is not in context yet
  .handle(() => ({}))

pipe()
  .use(() => ok({ user: { admin: true } }))
  .use(requireAdmin) // ✅ ok now
  .handle(({ admin }) => ({ admin }))
```

## `.transform(fn)` {#transform}

```ts
transform(fn: (res: Response, ctx: Ctx) => Response | Promise<Response>): Pipeline
```

Registers a **post-handler interceptor**. It receives the final `Response` and
the full context, and returns a (possibly new) `Response`. Multiple transforms
run in registration order. Runs only when the handler produced a response (it is
skipped when a step short-circuits).

```ts
pipe()
  .use((ctx) => ok({ requestId: crypto.randomUUID() }))
  .transform((res, ctx) => {
    res.headers.set('x-request-id', ctx.requestId)
    return res
  })
  .handle(() => ({ ok: true }))
```

Use it for CORS, security headers, timing, logging — anything that touches the
outgoing response.

## `.handle(handler)` {#handle}

```ts
handle<T>(handler: (ctx: Ctx) => T | Result<T, E> | Response | Promise<...>): CompiledHandler<Params>
```

Terminates the pipeline and returns the [`CompiledHandler`](#type-compiledhandler):
`(req, params) => Promise<Response>`. The handler may return:

| Return | Becomes |
| --- | --- |
| a plain value | `Response.json(value)` (status 200) |
| a `Response` | passed through untouched |
| `success(value)` | `Response.json(value)` |
| `failure(error)` | `options.onResult(error)` (throws if no mapper) |

```ts
import { pipe, success, failure } from 'pipeway'

const handler = pipe<{}, 'NotFound'>({
  onResult: (e) => new Response(e, { status: 404 }),
}).handle(({ params }) => {
  const user = lookup(params)
  return user ? success(user) : failure('NotFound')
})
```

## `ok()` / `fail()` {#ok-fail}

The only way to build a [`StepResult`](#type-stepresult).

```ts
function ok<Extra>(extra: Extra): StepResult<Extra>   // continue, merge `extra`
function fail(response: Response): StepResult<never>  // stop, return this Response
```

```ts
import { ok, fail, type Step } from 'pipeway'

const auth: Step<{ req: Request }, { userId: string }> = async (ctx) => {
  const token = ctx.req.headers.get('authorization')
  if (!token) return fail(new Response('Unauthorized', { status: 401 }))
  return ok({ userId: await verify(token) })
}
```

## Types

### `Step<Need, Extra>` {#type-step}

```ts
type Step<Need, Extra> = (ctx: Need) => StepResult<Extra> | Promise<StepResult<Extra>>
```

A function from the context it needs to a [`StepResult`](#type-stepresult). Pure
and never throws (return `fail(...)` instead). Write your own guards as `Step`s.

### `BaseCtx<Params>` {#type-basectx}

```ts
type BaseCtx<Params> = { readonly req: Request; readonly params: Params }
```

The context every pipeline starts with. `.use()` accumulates extra keys on top.

### `StepResult<Extra>` {#type-stepresult}

```ts
type StepResult<Extra> =
  | { readonly ok: true; readonly extra: Extra }
  | { readonly ok: false; readonly response: Response }
```

Built with [`ok`](#ok-fail) / [`fail`](#ok-fail).

### `PipeOptions<E>` {#type-pipeoptions}

```ts
type PipeOptions<E = never> = {
  onResult?: (error: E) => Response          // map a failed Result → Response
  onError?: (error: unknown, req: Request) => Response // last-resort catch
}
```

- **`onResult`** — required only if a handler returns `failure(...)`. Maps the
  domain error to an HTTP Response in one place.
- **`onError`** — catches an unexpected throw in any step or the handler. Without
  it, throws propagate to your runtime.

### `Handler<Ctx, T>` {#type-handler}

```ts
type Handler<Ctx, T> = (ctx: Ctx) => T | Response | Promise<T | Response>
```

### `CompiledHandler<Params>` {#type-compiledhandler}

```ts
type CompiledHandler<Params> = (req: Request, params: Params) => Promise<Response>
```

What `.handle()` returns. `params` is supplied by your router/runtime —
pipeway never routes.
