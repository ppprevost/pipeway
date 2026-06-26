# Result

pipeway is **Result-first**: a handler can return a domain `Result<T, E>` instead
of throwing. Failures are mapped to HTTP responses in one place
([`onResult`](/api/pipe#type-pipeoptions)), so your use-cases stay free of HTTP
concerns.

## `success()` / `failure()` {#success-failure}

```ts
function success<T>(value: T): Result<T, never>
function failure<E>(error: E): Result<never, E>
```

The constructors for a domain `Result`. They are **branded** with a symbol, so
the pipeline can tell a real `Result` from a plain `{ ok: true }` payload —
detection is never by shape.

```ts
import { pipe, success, failure } from 'pipeway'

type Err = 'NotFound' | 'Forbidden'

const getDoc = pipe<{ id: string }, Err>({
  onResult: (e) =>
    new Response(e, { status: e === 'NotFound' ? 404 : 403 }),
}).handle(async ({ params }) => {
  const doc = await load(params.id)
  if (!doc) return failure('NotFound')
  if (!doc.public) return failure('Forbidden')
  return success(doc) // → Response.json(doc)
})
```

::: tip Why brand it?
If `Result` were detected by shape (`{ ok, value }`), a handler returning a
normal payload like `{ ok: true }` would be mistaken for a Result. The symbol
brand removes that ambiguity — only values from `success`/`failure` are treated
as Results.
:::

## Mapping rules

When a handler returns, pipeway resolves the Response like this:

| Handler returns | Response |
| --- | --- |
| `success(value)` | `Response.json(value)` (200) |
| `failure(error)` | `options.onResult(error)` |
| `failure(error)` with **no** `onResult` | throws (configure a mapper) |
| a plain value | `Response.json(value)` |
| a `Response` | passed through |

## Types

### `Result<T, E>` {#type-result}

```ts
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }
```

Produced by [`success`](#success-failure) / [`failure`](#success-failure).

### `ResultMapper<E>` {#type-resultmapper}

```ts
type ResultMapper<E> = (error: E) => Response
```

The type of [`PipeOptions.onResult`](/api/pipe#type-pipeoptions).
