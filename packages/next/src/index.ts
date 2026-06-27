import type { StandardSchemaV1 } from '@standard-schema/spec'

// A typed pipeline for Next.js server actions ('use server' functions), mirroring
// pipeway's core lifecycle but for the action world: the input is the action
// argument (serializable), the output is a serializable ActionResult — never a
// Response, never a throw. Same compile-time step ordering.

export type ActionOk<T> = { readonly ok: true; readonly data: T }
export type ActionErr = { readonly ok: false; readonly error: string; readonly meta?: unknown }
export type ActionResult<T> = ActionOk<T> | ActionErr

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

type StepResult<Extra> = { readonly ok: true; readonly extra: Extra } | { readonly ok: false; readonly failure: ActionErr }

export type Step<Need, Extra> = (ctx: Need) => StepResult<Extra> | Promise<StepResult<Extra>>

export const ok = <Extra>(extra: Extra): StepResult<Extra> => ({ ok: true, extra })
export const fail = (error: string, meta?: unknown): StepResult<never> => ({
  ok: false,
  failure: meta === undefined ? { ok: false, error } : { ok: false, error, meta },
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
}

export type ActionPipeline<Input, Ctx extends BaseCtx<Input>, E> = {
  use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never): ActionPipeline<Input, Ctx & Extra, E>
  revalidate(...paths: string[]): ActionPipeline<Input, Ctx, E>
  handle<T>(handler: (ctx: Ctx) => T | Result<T, E> | Promise<T | Result<T, E>>): (input: Input) => Promise<ActionResult<T>>
}

const build = <Input, Ctx extends BaseCtx<Input>, E>(
  steps: ReadonlyArray<Step<unknown, unknown>>,
  paths: ReadonlyArray<string>,
  options: ActionOptions<E>,
): ActionPipeline<Input, Ctx, E> => ({
  use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never) {
    return build<Input, Ctx & Extra, E>([...steps, step as Step<unknown, unknown>], paths, options)
  },
  revalidate(...newPaths) {
    return build<Input, Ctx, E>(steps, [...paths, ...newPaths], options)
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
    ? fail('ValidationError', result.issues)
    : ok({ data: result.value })
}
