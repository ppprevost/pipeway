# Streaming LLM responses

pipeway streams by handing your handler's body source straight to the network.
[`.stream()`](/api/pipe#stream) accepts a `Response`, a `ReadableStream`, or any
`AsyncIterable<Uint8Array | string>` — so you can pipe a provider SDK's token
stream out as SSE with no Vercel AI SDK on the server, **or** pass a ready Vercel
AI SDK `Response` through untouched.

The examples below are the shape [FanChat](https://wearefanchat.com) ships in
production: a `/api/v3/message` chat route guarded by auth + rate-limit + a Zod
body, returning a token stream.

## The guard steps (auth, rate-limit, validation)

The route uses three steps. Validation comes from `pipeway-steps`; auth and
rate-limit are app-specific, so you write them as plain
[`Step`](/api/pipe#type-step)s (`(ctx) => ok(extra) | fail(response)`). The order
matters and the **compiler enforces it** — `rateLimit` reads `session.userId`, so
it cannot be placed before `session()`.

```ts
// lib/steps.ts
import { ok, fail, type Step } from 'pipeway'
import { body as validateBody } from 'pipeway-steps'
import { z } from 'zod'

// 1. auth — verifies the cookie/JWT and adds `session` to the context.
export const session = (): Step<{ req: Request }, { session: { userId: string } }> => async (ctx) => {
  const userId = await verifyToken(ctx.req)
  return userId
    ? ok({ session: { userId } })
    : fail(Response.json({ error: 'UnauthorizedError' }, { status: 401 }))
}

// 2. rate-limit — needs `session`, so it must come AFTER session(). The key
// function derives the bucket from the now-typed context.
export const rateLimit =
  (limiter: Limiter, key: (ctx: { session: { userId: string } }) => string): Step<{ session: { userId: string } }, Record<never, never>> =>
  async (ctx) => {
    const { success, reset } = await limiter.limit(key(ctx))
    return success
      ? ok({})
      : fail(Response.json({ error: 'RateLimitError' }, { status: 429, headers: { 'retry-after': String(reset) } }))
  }

// 3. validation — Standard Schema (Zod/Valibot/ArkType). Adds a typed `body`.
export const sendMessageSchema = z.object({
  characterId: z.string(),
  sessionId: z.string().optional(),
  messages: z.array(z.object({ role: z.string(), parts: z.array(z.unknown()) })),
  providerOverride: z.string().optional(),
})
export const body = validateBody // re-export pipeway-steps' body()
```

`body()` reads the JSON, validates it, and short-circuits on failure — `400
InvalidJson` for malformed JSON, `400 ValidationError` with the issue list when the
schema rejects. See [Steps](/api/steps) for the full contract and how to swap Zod
for Valibot/ArkType.

Wired together, ordering is checked at compile time:

```ts
pipe()
  .use(rateLimit(limiters.chat, ({ session }) => `user:${session.userId}`))
  //   ^ Type error: `session` is missing from context — session() must come first.
```

## Server — provider-raw (no Vercel AI SDK)

Pipe `anthropic.messages.stream()` (an `AsyncIterable` of events) straight out as
SSE. pipeway honors backpressure and cancels the upstream request when the client
disconnects.

```ts
// app/api/chat/route.ts
import { pipe } from 'pipeway'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { session, rateLimit, body } from '@/lib/steps' // your app's steps
import { domainCatcher } from '@/lib/http'

const anthropic = new Anthropic()

const bodySchema = z.object({
  characterId: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
})

export const POST = pipe()
  .use(session())
  .use(rateLimit('chat', ({ session }) => `user:${session.userId}`))
  .use(body(bodySchema))
  .catch(domainCatcher)
  .stream(async ({ session, body }) => {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: await buildSystemPrompt(body.characterId, session.userId),
      messages: body.messages,
    })

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
```

`session()` / `rateLimit()` run **before** the first chunk, so an unauthenticated
or throttled request gets a clean `401`/`429` JSON response — the stream never
opens. `domainCatcher` only sees throws raised before streaming starts.

## Server — Vercel AI SDK pass-through

If you already build the response with the Vercel AI SDK, return it directly. It's
a `Response`, so pipeway passes it through with its own headers — `.stream()` adds
nothing to undo:

```ts
// app/api/v3/message/route.ts
import { pipe } from 'pipeway'
import { streamText, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { session, rateLimit, body } from '@/lib/steps'
import { domainCatcher, providerAuthCatcher } from '@/lib/http'

export const POST = pipe()
  .use(session())
  .use(rateLimit('chat', ({ session }) => `user:${session.userId}`))
  .use(body(sendMessageSchema))
  .catch(domainCatcher)
  .catch(providerAuthCatcher)
  .stream(({ session, body }) => {
    const result = streamText({
      model: anthropic('claude-opus-4-8'),
      system: buildSystemPrompt(body, session.userId),
      messages: convertToModelMessages(body.messages),
      stopWhen: stepCountIs(5), // multi-step tool turns
    })
    return result.toUIMessageStreamResponse()
  })
```

::: tip Why `.stream()` and not `.handle()` here
`.handle()` also passes a `Response` through, so this works there too. `.stream()`
buys the **type guard**: its return type forbids a `Result`, so you can't
accidentally write `.stream(() => success(result.toUIMessageStreamResponse()))` —
that would JSON-serialize the `Response` object and silently break the body.
:::

## Server — LangChain

LangChain's `.stream()` and `.streamEvents()` return `AsyncIterable`s, so they drop
straight into `.stream()`. One catch: LangChain yields **objects**
(`AIMessageChunk`), not strings — map to the text yourself or pipeway will encode
`[object Object]`.

```ts
import { ChatAnthropic } from '@langchain/anthropic'

const model = new ChatAnthropic({ model: 'claude-opus-4-8' })

export const POST = pipe()
  .use(session())
  .stream(async ({ req }) => {
    const { messages } = await req.json()
    const stream = await model.stream(messages) // AsyncIterable<AIMessageChunk>
    async function* sse() {
      for await (const chunk of stream) {
        if (chunk.content) yield `data: ${JSON.stringify(chunk.content)}\n\n`
      }
      yield 'data: [DONE]\n\n'
    }
    return sse()
  })
```

An LCEL chain ending in a `StringOutputParser` already yields **strings**, so you
can return the stream directly — just override the content type:

```ts
.stream(
  async ({ req }) => chain.stream(await req.json()), // AsyncIterable<string>
  { headers: { 'content-type': 'text/plain; charset=utf-8' } },
)
```

`.streamEvents({ version: 'v2' })` gives token + tool-call + chain-step events;
filter for the one you want and frame it the same way. In every case, a client
disconnect cancels the iterator, which propagates the abort into LangChain and
stops the upstream model — no wasted tokens.

## Client — Vercel AI SDK in React

On the client, the Vercel AI SDK's `useChat` consumes the SSE stream and exposes
the assistant message as it streams in. Point its transport at your pipeway route.

```tsx
'use client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useMemo } from 'react'

export function Chat({ characterId, sessionId, userName }: ChatProps) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/v3/message',
        // Inject app fields into every request body — the same shape the route's
        // Zod `body()` step validates server-side.
        prepareSendMessagesRequest: ({ api, headers, body, messages }) => ({
          api,
          headers,
          body: { ...body, characterId, sessionId, user: userName, messages },
        }),
      }),
    [characterId, sessionId, userName],
  )

  const { messages, sendMessage, status, stop } = useChat({ transport })

  return (
    <div>
      {messages.map((m) => (
        <Bubble key={m.id} role={m.role}>
          {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
        </Bubble>
      ))}

      <Composer
        disabled={status === 'streaming'}
        onSend={(text) => sendMessage({ text })}
        onStop={stop}
      />
    </div>
  )
}
```

`status` drives the UI: `'submitted'` → request sent, `'streaming'` → tokens
arriving (show a stop button), `'ready'` → done. `stop()` aborts the fetch, which
cancels the `ReadableStream` — and because pipeway's `.stream()` propagates cancel
to the source iterator, the upstream LLM request is aborted too. No wasted tokens.

### Surfacing route errors (401 / 429 / provider down)

Steps short-circuit with a JSON body **before** the stream opens, so a failure is a
normal non-2xx response. Wrap the transport's `fetch` to intercept it and drive
your own UI (a re-login prompt, a "switch provider" banner):

```ts
const interceptingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  if (!res.ok && res.status >= 400 && res.status < 500) {
    const { error, kind, message } = await res.clone().json().catch(() => ({}))
    // e.g. kind === 'UnauthorizedError' -> open the login modal,
    //      kind === 'ProviderAuthError' -> prompt to fix the API key.
    handleChatError({ status: res.status, error, kind, message })
  }
  return res
}

new DefaultChatTransport({ api: '/api/v3/message', fetch: interceptingFetch, /* ... */ })
```

### Persisting the final message

`useChat`'s `onFinish` fires once the stream completes — persist there, not on
every token:

```ts
useChat({
  transport,
  onFinish: ({ message }) => {
    void fetch(`/api/chat/${characterId}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, message }),
    })
  },
})
```

## Recap

| Concern | Where |
|---|---|
| Auth / rate-limit / validation | `.use(step)` — runs before the first chunk |
| Provider-raw token stream → SSE | `.stream(() => asyncIterable)` |
| Vercel AI SDK response | `.stream(() => result.toUIMessageStreamResponse())` (pass-through) |
| Render tokens as they arrive | `useChat().messages` + `status` |
| Stop / cancel (aborts upstream) | `useChat().stop()` → cancel propagates to the iterator |
| Route errors before stream | intercept the transport `fetch` |
| Persist final message | `useChat({ onFinish })` |
