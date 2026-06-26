# React — `pipeway-react`

React hooks over [`pipeway-client`](/api/client). Because the client never throws,
the hooks expose a typed `{ data, error, status }` derived from `ClientResult` —
no `try/catch`, no thrown-promise dance. Zero dependencies beyond React.

```bash
pnpm add pipeway-react pipeway-client react
```

## `useMutation(fn)` {#usemutation}

For writes (POST/PUT/PATCH/DELETE) — the `useAction`-style hook.

```tsx
import { useMutation } from 'pipeway-react'
import { createClient } from 'pipeway-client'
import { z } from 'zod'

const api = createClient({ baseUrl: '/api' })
const Todo = z.object({ id: z.number(), title: z.string() })

function AddTodo() {
  const { mutate, isPending, error } = useMutation((title: string) =>
    api.post('/todos', { body: { title }, schema: Todo }),
  )

  return (
    <>
      <button onClick={() => mutate('Milk')} disabled={isPending}>Add</button>
      {error && <p>{error}</p>}
    </>
  )
}
```

Returns:

| Field | Type | |
| --- | --- | --- |
| `mutate(...args)` | `void` | fire-and-forget |
| `mutateAsync(...args)` | `Promise<ClientResult<T>>` | await the result |
| `data` | `T \| undefined` | last success payload |
| `error` | `string \| undefined` | last error |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | |
| `isIdle` / `isPending` / `isSuccess` / `isError` | `boolean` | |
| `reset()` | `void` | back to idle |

## `useQuery(fetcher, options?)` {#usequery}

For reads — runs on mount (and when `deps` change).

```tsx
import { useQuery } from 'pipeway-react'

function TodoView({ id }: { id: number }) {
  const { data, error, isLoading, refetch } = useQuery(
    () => api.get(`/todos/${id}`, { schema: Todo }),
    { deps: [id] },
  )

  if (isLoading) return <Spinner />
  if (error) return <p>{error}</p>
  return <h1>{data?.title}</h1>
}
```

### Options

| Field | Type | Default | |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | when `false`, waits until enabled |
| `deps` | `readonly unknown[]` | `[]` | re-runs on change (dependency array) |

Returns `{ data, error, status, isLoading, isSuccess, isError, refetch }`.

::: tip End to end
Pair it with [`pipeway-next`](/api/client) actions or any pipeway server: the
same schema validates on the server and types the hook on the client.
:::
