# pipeway-next

## 0.3.0

### Minor Changes

- 658018f: Add the lifecycle hooks a real app needs so an action pipeline can fully replace a
  hand-rolled one:

  - `onError(error, meta)` option — called when a step/handler throws, before the
    action masks it as `InternalError`. Re-throw framework control-flow here (in Next,
    `unstable_rethrow(error)`) so `redirect()` / `notFound()` keep working, and report
    the rest (Sentry). If it throws, the throw escapes the action unchanged. The raw
    error is no longer placed in the client-facing result (no message leak) — inspect
    it in `onError`.
  - `.meta({ name })` method — attach metadata surfaced to `onError` for triage.
  - `ActionErr` gains well-known optionals `fieldErrors?: Record<string, string>` and
    `retryAfter?: number`; `fail(error, extra?)` now takes an object so steps can
    attach them: `fail('ValidationError', { fieldErrors })`,
    `fail('RateLimitedError', { retryAfter })`.

  Note: `fail`'s second argument changed from a positional `meta` to an `extra`
  object — `fail('x', issues)` becomes `fail('x', { meta: issues })`.

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
