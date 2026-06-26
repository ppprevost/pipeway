import type {
  BaseCtx,
  CompiledHandler,
  Handler,
  PipeOptions,
  Pipeline,
  Result,
  Step,
  StepResult,
} from './types'

export type {
  BaseCtx,
  CompiledHandler,
  Handler,
  PipeOptions,
  Pipeline,
  Result,
  ResultMapper,
  Step,
  StepResult,
} from './types'

// Step constructors — the only way to build a StepResult, so call sites stay
// readable: `return ok({ user })` / `return fail(unauthorized())`.
export const ok = <Extra>(extra: Extra): StepResult<Extra> => ({ ok: true, extra })
export const fail = (response: Response): StepResult<never> => ({ ok: false, response })

// Domain Result constructors. Branded with a symbol so the pipeline can tell a
// real Result from a plain `{ ok: true }` payload — detection is NOT by shape.
const RESULT_BRAND = Symbol.for('pipeway.result')

export const success = <T>(value: T): Result<T, never> =>
  ({ ok: true, value, [RESULT_BRAND]: true }) as Result<T, never>
export const failure = <E>(error: E): Result<never, E> =>
  ({ ok: false, error, [RESULT_BRAND]: true }) as Result<never, E>

const isResult = (value: unknown): value is Result<unknown, unknown> =>
  typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[RESULT_BRAND] === true

const isResponse = (value: unknown): value is Response =>
  typeof Response !== 'undefined' && value instanceof Response

const build = <Params, Ctx extends BaseCtx<Params>, E>(
  steps: ReadonlyArray<Step<unknown, unknown>>,
  transforms: ReadonlyArray<(res: Response, ctx: unknown) => Response | Promise<Response>>,
  options: PipeOptions<E>,
): Pipeline<Params, Ctx, E> => ({
  use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never) {
    return build<Params, Ctx & Extra, E>([...steps, step as Step<unknown, unknown>], transforms, options)
  },
  transform(fn) {
    return build<Params, Ctx, E>(steps, [...transforms, fn as (res: Response, ctx: unknown) => Response | Promise<Response>], options)
  },
  handle<T>(handler: Handler<Ctx, T | Result<T, E>>): CompiledHandler<Params> {
    return async (req: Request, params: Params): Promise<Response> => {
      try {
        let ctx: Record<string, unknown> = { req, params }

        for (const step of steps) {
          const result = await step(ctx)
          if (!result.ok) {
            return result.response
          }
          ctx = { ...ctx, ...(result.extra as Record<string, unknown>) }
        }

        const out = await handler(ctx as unknown as Ctx)

        let response: Response
        if (isResponse(out)) {
          response = out
        } else if (isResult(out)) {
          if (out.ok) {
            response = Response.json(out.value)
          } else {
            if (!options.onResult) {
              throw new Error('pipeway: handler returned a failed Result but no `onResult` mapper was configured')
            }
            response = options.onResult(out.error as E)
          }
        } else {
          response = Response.json(out)
        }

        for (const t of transforms) {
          response = await t(response, ctx)
        }
        return response
      } catch (error) {
        if (options.onError) {
          return options.onError(error, req)
        }
        throw error
      }
    }
  },
})

// Entry point. `Params` defaults to an empty object; pass it explicitly when the
// route has path params: `pipe<{ id: string }>()`.
export const pipe = <Params = Record<never, never>, E = never>(
  options: PipeOptions<E> = {},
): Pipeline<Params, BaseCtx<Params>, E> => build<Params, BaseCtx<Params>, E>([], [], options)
