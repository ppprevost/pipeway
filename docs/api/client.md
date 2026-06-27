# Client — `pipeway-client`

A small, portable, **Result-first** REST client. Web-fetch based (Bun, Deno,
Workers, Node 18+, browsers), it **never throws** — every call resolves to a
discriminated `ClientResult`, mirroring pipeway's server ergonomics. Optionally
validates the response with a [Standard Schema](https://standardschema.dev).

```bash
pnpm add pipeway-client
```

## `createClient(config)` {#createclient}

```ts
function createClient(config: {
  baseUrl: string
  headers?: Record<string, string>
  fetch?: typeof fetch          // inject for tests / auth refresh / retries
}): Client
```

```ts
import { createClient } from 'pipeway-client'

const api = createClient({ baseUrl: 'https://api.example.com' })

const res = await api.get<{ id: number; title: string }>('/todos/1')
if (res.ok) {
  console.log(res.data.title) // typed
} else {
  console.error(res.status, res.error)
}
```

## Methods

`get` · `post` · `put` · `patch` · `delete` — same signature:

```ts
method<T>(path: string, options?: RequestOptions<T>): Promise<ClientResult<T>>
```

### `RequestOptions<T>`

| Field | Type | Notes |
| --- | --- | --- |
| `query` | `Record<string, string \| number \| boolean \| null \| undefined>` | `null`/`undefined` are skipped |
| `body` | `unknown` | JSON-serialized; sets `content-type: application/json` |
| `headers` | `Record<string, string>` | merged over the client headers |
| `schema` | `StandardSchemaV1<unknown, T>` | validates + types the response |
| `signal` | `AbortSignal` | cancellation |

## `ClientResult<T>`

```ts
type ClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; body?: unknown }
```

Resolution rules:

| Situation | Result |
| --- | --- |
| 2xx, no schema | `{ ok: true, data }` (`data` typed as `T`) |
| 2xx, schema passes | `{ ok: true, data }` (validated) |
| 2xx, schema fails | `{ ok: false, error: 'ResponseValidationError', body: issues }` |
| non-2xx | `{ ok: false, status, error, body }` |
| network error | `{ ok: false, status: 0, error }` |

## Validated, typed responses

```ts
import { createClient } from 'pipeway-client'
import { z } from 'zod'

const api = createClient({ baseUrl: '/api' })
const Todo = z.object({ id: z.number(), title: z.string(), done: z.boolean() })

const res = await api.get('/todos/1', { schema: Todo })
// res.data is z.infer<typeof Todo> when res.ok — checked at runtime too
```

::: tip Pairs with the server
Reuse the **same** schema your server validates with on both sides — one source
of truth for the shape, enforced at both ends.
:::

## `unwrap(result)` {#unwrap}

```ts
function unwrap<T>(result: ClientResult<T>): T // throws ClientError on failure
```

The bridge to throw-based data libraries (TanStack Query, SWR). Drop it in a
`queryFn` / fetcher:

```ts
import { createClient, unwrap } from 'pipeway-client'

useQuery({
  queryKey: ['todo', id],
  queryFn: () => api.get(`/todos/${id}`, { schema: Todo }).then(unwrap),
})
```

On failure it throws a typed `ClientError` (`status`, `message`, `body`). See the
[With React Query](/guide/with-react-query) guide — pipeway ships **no** custom
hooks, your data library keeps the caching.
