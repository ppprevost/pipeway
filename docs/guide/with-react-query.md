# With React Query (or SWR)

pipeway does **not** ship a data-fetching/caching layer — TanStack Query and SWR
already do that well. Instead, the client composes with them in one line.

The client is **Result-first** (it never throws). Throw-based libraries like
React Query expect a `queryFn` that throws on failure — so `pipeway-client`
exports [`unwrap`](/api/client#unwrap), which returns the data or throws a typed
`ClientError`.

## Queries

```tsx
import { useQuery } from '@tanstack/react-query'
import { createClient, unwrap } from 'pipeway-client'
import { z } from 'zod'

const api = createClient({ baseUrl: '/api' })
const Todo = z.object({ id: z.number(), title: z.string() })

function TodoView({ id }: { id: number }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['todo', id],
    queryFn: () => api.get(`/todos/${id}`, { schema: Todo }).then(unwrap),
  })

  if (isPending) return <Spinner />
  if (error) return <p>{(error as Error).message}</p>
  return <h1>{data.title}</h1> // data is typed from the schema
}
```

You keep everything React Query gives you — caching, dedup, background refetch,
stale-while-revalidate, devtools — and pipeway gives you the typed, validated,
portable request underneath.

## Mutations

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrap } from 'pipeway-client'

function AddTodo() {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: (title: string) => api.post('/todos', { body: { title }, schema: Todo }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  })

  return <button onClick={() => mutate('Milk')} disabled={isPending}>Add</button>
}
```

## With a Next server action

A [`pipeway-next`](/api/next) action returns an `ActionResult`. Unwrap it the same way:

```tsx
import { useMutation } from '@tanstack/react-query'
import { createTodo } from './actions' // a pipeway-next action

const { mutate } = useMutation({
  mutationFn: async (title: string) => {
    const res = await createTodo({ title })
    if (!res.ok) throw new Error(res.error)
    return res.data
  },
})
```

## SWR

```tsx
import useSWR from 'swr'
import { unwrap } from 'pipeway-client'

const { data } = useSWR(['todo', id], () => api.get(`/todos/${id}`, { schema: Todo }).then(unwrap))
```

That's the whole integration. No pipeway-specific hooks to learn — your data
library stays in charge, pipeway just types and validates the wire.
