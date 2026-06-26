# Compile-time step ordering

pipeway accumulates the context type as you chain `.use()`. Each step declares
what it **needs** in context. If the current context doesn't satisfy it, the call
is a **type error** — caught by `tsc`, not at runtime.

## The mistake the compiler catches

```ts
import { pipe, ok, type Step } from 'pipeway'

// A step that NEEDS `user` already in context.
const requireAdmin: Step<{ user: { admin: boolean } }, { admin: true }> = (ctx) =>
  ok({ admin: true as const })

pipe()
  .use(requireAdmin) // user is not in context yet
  .handle(() => ({ ok: true }))
```

## Add the producer first, and it type-checks

```ts
import { pipe, ok, type Step } from 'pipeway'

const requireAdmin: Step<{ user: { admin: boolean } }, { admin: true }> = (ctx) =>
  ok({ admin: true as const })

pipe()
  .use(() => ok({ user: { admin: true } }))
  .use(requireAdmin) // ✅ user is now in context
  .handle(({ admin }) => ({ admin }))
```
