---
"pipeway-next": minor
---

Add the lifecycle hooks a real app needs so an action pipeline can fully replace a
hand-rolled one:

- `onError(error, meta)` option — called when a step/handler throws, before the
  action masks it as `InternalError`. Re-throw framework control-flow here (in Next,
  `unstable_rethrow(error)`) so `redirect()` / `notFound()` keep working, and report
  the rest (Sentry). If it throws, the throw escapes the action unchanged.
- `.meta({ name })` method — attach metadata surfaced to `onError` for triage.
- `ActionErr` gains well-known optionals `fieldErrors?: Record<string, string>` and
  `retryAfter?: number`; `fail(error, extra?)` now takes an object so steps can
  attach them: `fail('ValidationError', { fieldErrors })`,
  `fail('RateLimitedError', { retryAfter })`.

Note: `fail`'s second argument changed from a positional `meta` to an `extra`
object — `fail('x', issues)` becomes `fail('x', { meta: issues })`.
