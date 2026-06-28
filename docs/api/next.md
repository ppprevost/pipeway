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
| `adaptResult` | `(out) => { ok, value } \| { ok: false, error } \| null` | recognize a **foreign Result** shape your handlers return (a different `Result` than pipeway's) and normalize it — return `null` to fall through |
| `onError` | `(error: unknown, meta: ActionMeta) => void` | called on a thrown step/handler before the action masks it as `InternalError`. Report it (Sentry) and **re-throw framework control-flow** here so it isn't swallowed (see below) |

### `onError` — report & don't swallow `redirect()`

A server action that returns an `ActionResult` must never throw — so the pipeline
catches everything. But Next signals `redirect()` / `notFound()` by **throwing** a
control-flow error that the framework needs to see. `onError` lets you re-throw it
(and tag/report real errors):

```ts
import { unstable_rethrow } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'

const action0 = action({
  onError: (error, meta) => {
    unstable_rethrow(error) // re-throws redirect/notFound; returns for real errors
    Sentry.captureException(error, { tags: { action: meta.name } })
  },
})
```

If `onError` throws, that throw escapes the action unchanged — exactly what
`unstable_rethrow` needs. Otherwise the action returns `InternalError`.

### Foreign Result interop

If your codebase has its own `Result` type (say `{ success }`-shaped), let pipeway
understand it without changing handlers:

```ts
const action0 = action<void, MyError>({
  onResult: (e) => e.kind,
  adaptResult: (out) =>
    isMyResult(out) ? (out.success ? { ok: true, value: out.data } : { ok: false, error: out.error }) : null,
})
```

`revalidate` is **injected** (not imported) so the package stays framework-light
and trivially testable. In Next, pass `revalidatePath` from `next/cache`.

## Methods

- **`.use(step)`** — add a guard/step; same compile-time ordering as the core
  (`Ctx extends Need`). Ad-hoc inline steps that read `ctx` need a param
  annotation; pre-typed steps like [`input`](#input) infer automatically.
- **`.revalidate(...paths)`** — record paths to revalidate after a successful run.
- **`.meta(meta)`** — attach metadata (e.g. `{ name: 'createTodo' }`) surfaced to
  `onError` for triage. Returns the pipeline.
- **`.handle(handler)`** — terminate → `(input) => Promise<ActionResult<T>>`.

## `ActionResult<T>`

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; meta?: unknown; fieldErrors?: Record<string, string>; retryAfter?: number }
```

`fieldErrors` and `retryAfter` are well-known optionals for the two concerns every
action UI has — form validation and rate limiting — so a form can map per-field
messages and a throttled call can show a retry hint without reaching into `meta`.

| Handler returns | Result |
| --- | --- |
| a value | `{ ok: true, data }` |
| `success(value)` | `{ ok: true, data: value }` |
| `failure(error)` | `{ ok: false, error: onResult(error) }` |
| throws | `onError(error, meta)` runs (may re-throw), else `{ ok: false, error: 'InternalError' }` |

## Steps: `ok` · `fail` · `input`

```ts
ok(extra)               // continue, merge `extra` into context
fail(error, extra?)     // stop → { ok: false, error, ...extra }
input(schema)           // validate the action arg → typed `ctx.data`
```

`fail`'s `extra` carries the well-known `ActionErr` fields:

```ts
fail('ValidationError', { fieldErrors: { title: 'required' }, meta: rawIssues })
fail('RateLimitedError', { retryAfter: 30 })
```

```ts
import { ok, fail, type Step } from 'pipeway-next'

export const session = (): Step<{ input: unknown }, { session: { userId: string } }> => async () => {
  const s = await getServerSession()
  return s ? ok({ session: s }) : fail('Unauthorized')
}
```

## Using it from React

These actions plug into React's built-in hooks — no pipeway-specific client hook.
See the guides:

- [With React 19](/guide/with-react) — `useActionState`, `useFormStatus`, `useOptimistic` for forms & mutations.
- [With React Query](/guide/with-react-query) — client-side reads (TanStack Query / SWR).
