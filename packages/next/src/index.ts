import type { StandardSchemaV1 } from '@standard-schema/spec'

// A typed pipeline for Next.js server actions ('use server' functions), mirroring
// pipeway's core lifecycle but for the action world: the input is the action
// argument (serializable), the output is a serializable ActionResult — never a
// Response, never a throw. Same compile-time step ordering.

export type ActionOk<T> = { readonly ok: true; readonly data: T }
// Well-known optional fields cover the two concerns every action UI needs: form
// field errors (validation) and a retry hint (rate limiting). `meta` carries
// anything else (e.g. raw issues for logging).
export type ActionErr = {
  readonly ok: false
  readonly error: string
  readonly meta?: unknown
  readonly fieldErrors?: Record<string, string>
  readonly retryAfter?: number
}
export type ActionResult<T> = ActionOk<T> | ActionErr

// Action metadata, surfaced to `onError` for triage (e.g. a Sentry tag).
export type ActionMeta = { readonly name?: string }

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

type StepResult<Extra> = { readonly ok: true; readonly extra: Extra } | { readonly ok: false; readonly failure: ActionErr }

export type Step<Need, Extra> = (ctx: Need) => StepResult<Extra> | Promise<StepResult<Extra>>

export const ok = <Extra>(extra: Extra): StepResult<Extra> => ({ ok: true, extra })
// `extra` attaches the well-known ActionErr fields (meta, fieldErrors, retryAfter)
// to the failure: `fail('ValidationError', { fieldErrors })`,
// `fail('RateLimitedError', { retryAfter })`.
export const fail = (error: string, extra?: Partial<Omit<ActionErr, 'ok' | 'error'>>): StepResult<never> => ({
  ok: false,
  failure: { ok: false, error, ...extra },
})

const RESULT_BRAND = Symbol.for('pipeway.result')
export const success = <T>(value: T): Result<T, never> => ({ ok: true, value, [RESULT_BRAND]: true }) as Result<T, never>
export const failure = <E>(error: E): Result<never, E> =>
  ({ ok: false, error, [RESULT_BRAND]: true }) as Result<never, E>
const isResult = (v: unknown): v is Result<unknown, unknown> =>
  typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[RESULT_BRAND] === true

type BaseCtx<Input> = { readonly input: Input }

// Bring-your-own-Result interop: recognize a foreign Result type (a different
// shape than pipeway's `success`/`failure`) and normalize it. Return null for a
// value that is not one of your Results.
export type ResultAdapter<E> = (out: unknown) => { ok: true; value: unknown } | { ok: false; error: E } | null

export type ActionOptions<E = never> = {
  // Maps a failed domain Result error to the user-facing error string.
  onResult?: (error: E) => string
  // Called once per `.revalidate()` path after a successful action. In Next, pass
  // `revalidatePath` from 'next/cache'. Omitted = no-op (handy in tests).
  revalidate?: (path: string) => void
  // Recognize/convert a foreign Result type your handlers return (e.g. a
  // `{ success }`-shaped Result from another codebase). Tried before pipeway's own
  // `success`/`failure`. Return null to fall through to the default handling.
  adaptResult?: ResultAdapter<E>
  // Called when a step or the handler throws, before the action returns
  // `InternalError`. Use it to report (Sentry) and to RE-THROW framework
  // control-flow errors so they are not swallowed: in Next, call
  // `unstable_rethrow(error)` here so `redirect()` / `notFound()` keep working.
  // Receives the action's `meta()` for tagging. If it throws, that throw escapes
  // the action (which is exactly what `unstable_rethrow` needs).
  onError?: (error: unknown, meta: ActionMeta) => void
}

export type ActionPipeline<Input, Ctx extends BaseCtx<Input>, E> = {
  use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never): ActionPipeline<Input, Ctx & Extra, E>
  revalidate(...paths: string[]): ActionPipeline<Input, Ctx, E>
  // Attach metadata (e.g. an action name) surfaced to `onError` for triage.
  meta(meta: ActionMeta): ActionPipeline<Input, Ctx, E>
  handle<T>(handler: (ctx: Ctx) => T | Result<T, E> | Promise<T | Result<T, E>>): (input: Input) => Promise<ActionResult<T>>
}

const build = <Input, Ctx extends BaseCtx<Input>, E>(
  steps: ReadonlyArray<Step<unknown, unknown>>,
  paths: ReadonlyArray<string>,
  options: ActionOptions<E>,
  actionMeta: ActionMeta = {},
): ActionPipeline<Input, Ctx, E> => ({
  use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never) {
    return build<Input, Ctx & Extra, E>([...steps, step as Step<unknown, unknown>], paths, options, actionMeta)
  },
  revalidate(...newPaths) {
    return build<Input, Ctx, E>(steps, [...paths, ...newPaths], options, actionMeta)
  },
  meta(next) {
    return build<Input, Ctx, E>(steps, paths, options, { ...actionMeta, ...next })
  },
  handle<T>(handler: (ctx: Ctx) => T | Result<T, E> | Promise<T | Result<T, E>>) {
    return async (input: Input): Promise<ActionResult<T>> => {
      try {
        let ctx: Record<string, unknown> = { input }
        for (const step of steps) {
          const result = await step(ctx)
          if (!result.ok) {
            return result.failure
          }
          ctx = { ...ctx, ...(result.extra as Record<string, unknown>) }
        }

        const out = await handler(ctx as unknown as Ctx)

        const adapted = options.adaptResult ? options.adaptResult(out) : null
        if (adapted) {
          if (!adapted.ok) {
            const error = options.onResult ? options.onResult(adapted.error) : String(adapted.error)
            return { ok: false, error }
          }
          revalidateAll(paths, options.revalidate)
          return { ok: true, data: adapted.value as T }
        }

        if (isResult(out)) {
          if (!out.ok) {
            const error = options.onResult ? options.onResult(out.error as E) : String(out.error)
            return { ok: false, error }
          }
          revalidateAll(paths, options.revalidate)
          return { ok: true, data: out.value as T }
        }

        revalidateAll(paths, options.revalidate)
        return { ok: true, data: out as T }
      } catch (error) {
        // onError may re-throw (e.g. unstable_rethrow for redirect/notFound) — let
        // that escape so framework control-flow keeps working; otherwise report + mask.
        options.onError?.(error, actionMeta)
        return { ok: false, error: 'InternalError', meta: error instanceof Error ? error.message : String(error) }
      }
    }
  },
})

const revalidateAll = (paths: ReadonlyArray<string>, revalidate?: (path: string) => void): void => {
  if (!revalidate) {
    return
  }
  for (const p of paths) {
    revalidate(p)
  }
}

// Entry point. Type the action argument: `action<{ title: string }>()`.
export const action = <Input = void, E = never>(options: ActionOptions<E> = {}): ActionPipeline<Input, BaseCtx<Input>, E> =>
  build<Input, BaseCtx<Input>, E>([], [], options)

// ---------- steps --------------------------------------------------------------

// Validates the raw action input against a Standard Schema, adding typed `data`.
export const input = <T>(schema: StandardSchemaV1<unknown, T>): Step<{ input: unknown }, { data: T }> => async (ctx) => {
  let result = schema['~standard'].validate(ctx.input)
  if (result instanceof Promise) {
    result = await result
  }
  return result.issues
    ? fail('ValidationError', { meta: result.issues })
    : ok({ data: result.value })
}
