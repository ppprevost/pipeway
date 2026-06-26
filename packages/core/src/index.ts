import type {
  BaseCtx,
  Catcher,
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
  Catcher,
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

type AnyFn = (...args: never[]) => unknown

type Internals<E> = {
  steps: ReadonlyArray<Step<unknown, unknown>>
  maps: ReadonlyArray<(ctx: unknown) => unknown | Promise<unknown>>
  serializers: ReadonlyArray<(body: unknown) => unknown>
  transforms: ReadonlyArray<(res: Response, ctx: unknown) => Response | Promise<Response>>
  catchers: ReadonlyArray<Catcher>
  options: PipeOptions<E>
}

const append = <K extends keyof Internals<unknown>>(
  internals: Internals<unknown>,
  key: K,
  value: Internals<unknown>[K] extends ReadonlyArray<infer I> ? I : never,
): Internals<unknown> => ({ ...internals, [key]: [...(internals[key] as ReadonlyArray<unknown>), value] })

const isJsonResponse = (res: Response): boolean =>
  (res.headers.get('content-type') ?? '').includes('application/json')

const build = <Params, Ctx extends BaseCtx<Params>, E>(internals: Internals<E>): Pipeline<Params, Ctx, E> => {
  const next = <C extends BaseCtx<Params>>(i: Internals<E>) => build<Params, C, E>(i)
  const ints = internals as Internals<unknown>
  return {
    use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never) {
      return next<Ctx & Extra>(append(ints, 'steps', step as Step<unknown, unknown>) as Internals<E>)
    },
    map(fn) {
      return next<Ctx>(append(ints, 'maps', fn as (ctx: unknown) => unknown) as Internals<E>)
    },
    catch(catcher) {
      return next<Ctx>(append(ints, 'catchers', catcher) as Internals<E>)
    },
    serialize(fn) {
      return next<Ctx>(append(ints, 'serializers', fn) as Internals<E>)
    },
    transform(fn) {
      return next<Ctx>(
        append(ints, 'transforms', fn as (res: Response, ctx: unknown) => Response | Promise<Response>) as Internals<E>,
      )
    },
    handle<T>(handler: Handler<Ctx, T | Result<T, E>>): CompiledHandler<Params> {
      return compile<Params, Ctx, E, T>(internals, handler, 200)
    },
    json<T>(handler: Handler<Ctx, T | Result<T, E>>, status = 200): CompiledHandler<Params> {
      return compile<Params, Ctx, E, T>(internals, handler, status)
    },
  } satisfies Record<string, AnyFn> as unknown as Pipeline<Params, Ctx, E>
}

const compile = <Params, Ctx, E, T>(
  internals: Internals<E>,
  handler: Handler<Ctx, T | Result<T, E>>,
  jsonStatus: number,
): CompiledHandler<Params> => {
  const { steps, maps, serializers, transforms, catchers, options } = internals
  const jsonInit = jsonStatus === 200 ? undefined : { status: jsonStatus }

  const applySerializers = async (res: Response): Promise<Response> => {
    if (serializers.length === 0 || !isJsonResponse(res)) {
      return res
    }
    let body = await res.json()
    for (const s of serializers) {
      body = s(body)
    }
    return new Response(JSON.stringify(body), { status: res.status, headers: res.headers })
  }

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

      for (const m of maps) {
        ctx = (await m(ctx)) as Record<string, unknown>
      }

      const out = await handler(ctx as unknown as Ctx)

      let response: Response
      if (isResponse(out)) {
        response = out
      } else if (isResult(out)) {
        if (out.ok) {
          response = Response.json(out.value, jsonInit)
        } else {
          if (!options.onResult) {
            throw new Error('pipeway: handler returned a failed Result but no `onResult` mapper was configured')
          }
          response = options.onResult(out.error as E)
        }
      } else {
        response = Response.json(out, jsonInit)
      }

      response = await applySerializers(response)
      for (const t of transforms) {
        response = await t(response, ctx)
      }
      return response
    } catch (error) {
      for (const catcher of catchers) {
        const handled = catcher(error, req)
        if (handled) {
          return handled
        }
      }
      if (options.onError) {
        return options.onError(error, req)
      }
      throw error
    }
  }
}

// Entry point. `Params` defaults to an empty object; pass it explicitly when the
// route has path params: `pipe<{ id: string }>()`.
export const pipe = <Params = Record<never, never>, E = never>(
  options: PipeOptions<E> = {},
): Pipeline<Params, BaseCtx<Params>, E> =>
  build<Params, BaseCtx<Params>, E>({ steps: [], maps: [], serializers: [], transforms: [], catchers: [], options })
