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

## `.map(fn)` {#map}

```ts
map(fn: (ctx: Ctx) => Ctx | Promise<Ctx>): Pipeline
```

A **pre-handler context transform**. Runs after all steps, before the handler.
Same context type in and out — use it to normalize or sanitize.

```ts
pipe()
  .use(body(z.object({ email: z.string() })))
  .map((ctx) => ({ ...ctx, body: { ...ctx.body, email: ctx.body.email.toLowerCase() } }))
  .handle(({ body }) => ({ email: body.email }))
```

## `.catch(catcher)` {#catch}

```ts
catch(catcher: (error: unknown, req: Request) => Response | null | undefined): Pipeline
```

Registers an **exception filter** (NestJS `@Catch` equivalent). If a step, map,
handler, or serializer throws, catchers run **in order**; the first to return a
`Response` wins. Return `null`/`undefined` to pass to the next filter. If none
handle it, [`onError`](#type-pipeoptions) runs, otherwise the error rethrows.

```ts
pipe()
  .catch((err) => (err instanceof NotFoundError ? new Response('Not found', { status: 404 }) : null))
  .catch((err) => new Response('Internal error', { status: 500 })) // fallback
  .handle(({ params }) => loadOrThrow(params.id))
```

Composable filters replace scattered `try/catch`: domain errors map to status
codes in one place, and the catch-all sits last.

## `.serialize(fn)` {#serialize}

```ts
serialize(fn: (body: unknown) => unknown): Pipeline
```

A **post-handler JSON body filter** (a serializer). Runs only on JSON responses;
anything else passes through. Use it to strip sensitive fields before they leave.
Multiple serializers chain in order. Status and headers are preserved.

```ts
pipe()
  .serialize((body) => {
    const { passwordHash, ...safe } = body as Record<string, unknown>
    return safe
  })
  .handle(() => getUserRecord()) // { id, name, passwordHash }
// response body → { id, name }
```

::: tip Zod serializer
For schema-driven stripping, run a Zod schema inside `serialize`:
`.serialize((b) => publicUser.parse(b))`.
:::

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

## `.json(handler, status?)` {#json}

```ts
json<T>(handler: (ctx: Ctx) => T | Result<T, E> | Response, status?: number): CompiledHandler<Params>
```

Like [`.handle()`](#handle), but JSON-serialized values use `status` (default
`200`). Lets a handler stay pure — return a plain value — while still answering
`201`/`202`/… declaratively. A returned `Response` still passes through with its
own status; a `failure(...)` still goes through `onResult`.

```ts
import { pipe } from 'pipeway'

const createTodo = pipe()
  .json(({ params }) => ({ id: crypto.randomUUID() }), 201) // → 201 Created
```

## `.stream(handler, init?)` {#stream}

```ts
stream(
  handler: (ctx: Ctx) => StreamSource | Promise<StreamSource>,
  init?: ResponseInit,
): CompiledHandler<Params>

type StreamSource =
  | Response
  | ReadableStream<Uint8Array | string>
  | AsyncIterable<Uint8Array | string>
```

Terminates the pipeline with a **streamed body**. Steps still run first, so an
auth/rate-limit failure short-circuits with its own `Response` **before any chunk
is sent**. The handler returns a body source rather than a value:

| Return | Result |
|---|---|
| a `Response` | passed through verbatim, keeping its own headers |
| a `ReadableStream` | wrapped in a `Response`; string chunks are UTF-8 encoded |
| an `AsyncIterable` | bridged to a `ReadableStream` with backpressure + cancel |

`init` overrides the default headers (used only for a raw stream/iterable — a
returned `Response` keeps its own). The defaults are SSE-flavored but generic:

```
content-type: text/event-stream; charset=utf-8
cache-control: no-cache, no-transform
connection:    keep-alive
```

The handler **cannot return a `Result`** — the type forbids it. Wrapping a stream
in `success(...)` would JSON-serialize the stream object and corrupt the body;
`.stream()` makes that a compile error instead of a silent bug.

`serialize()` never runs on a stream (it would buffer it). `transform()` still runs
(headers, logging) — but a transform must not read the body. `catch()`/`onError`
only see a throw raised **before** the first chunk; once streaming starts, a failure
lives inside the stream and pipeway can no longer convert it.

```ts
import { pipe } from 'pipeway'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Stream an LLM provider's tokens as SSE — no Vercel AI SDK needed.
const chat = pipe()
  .use(session())
  .stream(async ({ req }) => {
    const { messages } = await req.json()
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages,
    })
    // anthropic stream is an AsyncIterable of events; map to SSE lines.
    async function* sse() {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield `data: ${JSON.stringify(event.delta.text)}\n\n`
        }
      }
      yield 'data: [DONE]\n\n'
    }
    return sse()
  })

// Already have a framework Response (e.g. Vercel AI SDK)? Return it directly —
// it passes through with its own headers.
const aiChat = pipe()
  .use(session())
  .stream(({ req }) => streamText({ model, messages }).toUIMessageStreamResponse())
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
- **`adaptResult`** — recognize a foreign Result shape your handlers return (a different `Result` than pipeway's `success`/`failure`) and normalize it. Tried before pipeway's own Result; return null to fall through. Pairs with `onResult`.

### `Handler<Ctx, T>` {#type-handler}

```ts
type Handler<Ctx, T> = (ctx: Ctx) => T | Response | Promise<T | Response>
```

### `StreamSource` / `StreamHandler<Ctx>` {#type-stream}

```ts
type StreamSource =
  | Response
  | ReadableStream<Uint8Array | string>
  | AsyncIterable<Uint8Array | string>

type StreamHandler<Ctx> = (ctx: Ctx) => StreamSource | Promise<StreamSource>
```

What [`.stream()`](#stream) accepts. Notably **not** a `Result` — that exclusion is
deliberate (see `.stream()`).

### `CompiledHandler<Params>` {#type-compiledhandler}

```ts
type CompiledHandler<Params> = (req: Request, params: Params) => Promise<Response>
```

What `.handle()` returns. `params` is supplied by your router/runtime —
pipeway never routes.
