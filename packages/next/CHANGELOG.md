# pipeway-next

## 0.2.0

### Minor Changes

- 8d8a852: Add `adaptResult` option — bring-your-own-Result interop. Recognize and normalize
  a foreign `Result` shape your handlers return (e.g. a `{ success }`-shaped Result
  from another codebase) without changing call sites.

## 0.1.0

### Minor Changes

- e8675c6: New package — a typed pipeline for Next.js server actions. Same compile-time step
  ordering as the core, Result-first `ActionResult` output (never throws), Standard
  Schema `input` validation, and injected `revalidate` (pass `revalidatePath`).
