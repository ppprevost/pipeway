# With React 19 (forms, pending, optimistic)

A [`pipeway-next`](/api/next) action is a plain `(input) => Promise<ActionResult<T>>`,
so it plugs straight into React's built-in hooks — no pipeway-specific client hook
to learn. (For client-side **reads**, see [With React Query](/guide/with-react-query).)

## `useActionState` — form state + the result

```tsx
'use client'
import { useActionState } from 'react'
import { createTodo } from './actions' // a pipeway-next action

export function TodoForm() {
  const [state, formAction, isPending] = useActionState(
    (_prev: Awaited<ReturnType<typeof createTodo>> | null, formData: FormData) =>
      createTodo({ title: String(formData.get('title')) }),
    null,
  )

  return (
    <form action={formAction}>
      <input name="title" />
      <button disabled={isPending}>Add</button>
      {state && !state.ok && <p role="alert">{state.error}</p>}
    </form>
  )
}
```

`state` is the action's `ActionResult` — `{ ok: true, data }` or `{ ok: false, error }`.

## `useFormStatus` — pending state in a child

```tsx
'use client'
import { useFormStatus } from 'react-dom'

export function SubmitButton() {
  const { pending } = useFormStatus()
  return <button disabled={pending}>Save</button>
}
```

## `useOptimistic` — optimistic UI

```tsx
'use client'
import { useOptimistic } from 'react'
import { createTodo } from './actions'

export function Todos({ todos }: { todos: Todo[] }) {
  const [optimistic, addOptimistic] = useOptimistic(todos, (state, title: string) => [
    ...state,
    { id: 'temp', title },
  ])

  async function add(formData: FormData) {
    const title = String(formData.get('title'))
    addOptimistic(title)
    await createTodo({ title }) // ActionResult; revalidate refreshes the list
  }

  return (
    <form action={add}>
      <ul>{optimistic.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
      <input name="title" />
    </form>
  )
}
```
