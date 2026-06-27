# Next server actions — `pipeway-next`

A typed pipeline for **Next.js server actions** (`'use server'` functions). Same
lifecycle and compile-time step ordering as the core, but for the action world:
the input is the action argument, the output is a serializable **`ActionResult`** —
never a `Response`, never a throw.

```bash
pnpm add pipeway-next
```

```tsx
'use server'
import { action, input } from 'pipeway-next'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export const createTodo = action({ revalidate: revalidatePath })
  .use(session())                       // your guard
  .use(input(z.object({ title: z.string().min(1) })))
  .revalidate('/todos')
  .handle(({ session, data }) => todoRepo.create(session.userId, data.title))
// → (raw) => Promise<ActionResult<Todo>>
```

Call it straight from a client component — it returns a discriminated result:

```tsx
const res = await createTodo({ title })
if (res.ok) console.log(res.data)
else console.error(res.error)
```

## `action(options?)` {#action}

```ts
function action<Input = void, E = never>(options?: ActionOptions<E>): ActionPipeline
```

- **`Input`** — the action argument type: `action<{ title: string }>()`.
- **`E`** — domain error type for `Result` returns (see `onResult`).

### `ActionOptions<E>`

| Field | Type | |
| --- | --- | --- |
| `onResult` | `(error: E) => string` | map a failed `Result` to the user-facing error |
| `revalidate` | `(path: string) => void` | called per `.revalidate()` path on success — pass `revalidatePath` |

`revalidate` is **injected** (not imported) so the package stays framework-light
and trivially testable. In Next, pass `revalidatePath` from `next/cache`.

## Methods

- **`.use(step)`** — add a guard/step; same compile-time ordering as the core
  (`Ctx extends Need`). Ad-hoc inline steps that read `ctx` need a param
  annotation; pre-typed steps like [`input`](#input) infer automatically.
- **`.revalidate(...paths)`** — record paths to revalidate after a successful run.
- **`.handle(handler)`** — terminate → `(input) => Promise<ActionResult<T>>`.

## `ActionResult<T>`

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; meta?: unknown }
```

| Handler returns | Result |
| --- | --- |
| a value | `{ ok: true, data }` |
| `success(value)` | `{ ok: true, data: value }` |
| `failure(error)` | `{ ok: false, error: onResult(error) }` |
| throws | `{ ok: false, error: 'InternalError' }` (never propagates) |

## Steps: `ok` · `fail` · `input`

```ts
ok(extra)               // continue, merge `extra` into context
fail(error, meta?)      // stop → { ok: false, error }
input(schema)           // validate the action arg → typed `ctx.data`
```

```ts
import { ok, fail, type Step } from 'pipeway-next'

export const session = (): Step<{ input: unknown }, { session: { userId: string } }> => async () => {
  const s = await getServerSession()
  return s ? ok({ session: s }) : fail('Unauthorized')
}
```

## With React 19 (forms, pending, optimistic)

pipeway-next actions are plain `(input) => Promise<ActionResult<T>>`, so they plug
straight into React's built-in hooks — no pipeway-specific client hook to learn.

### `useActionState` — form state + the result

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

### `useFormStatus` — pending state in a child

```tsx
'use client'
import { useFormStatus } from 'react-dom'

export function SubmitButton() {
  const { pending } = useFormStatus()
  return <button disabled={pending}>Save</button>
}
```

### `useOptimistic` — optimistic UI

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

::: tip For client-side reads
Not a form/action? Use [TanStack Query or SWR with `unwrap`](/guide/with-react-query)
on a `pipeway-client` call. pipeway ships no custom data hooks.
:::
