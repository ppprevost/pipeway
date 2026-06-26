// Web-standard foundation: every handler is (Request, params) => Response.
// No framework types leak in here — that is what makes the pipeline portable
// across Bun, Deno, Workers, Next route handlers, Hono, and (via an adapter)
// Node/Express.

export type BaseCtx<Params> = {
  readonly req: Request
  readonly params: Params
}

// A step either enriches the context with `Extra` (ok) or short-circuits the
// whole pipeline with a ready-made Response (fail). It never throws.
export type StepResult<Extra> = { readonly ok: true; readonly extra: Extra } | { readonly ok: false; readonly response: Response }

export type Step<Need, Extra> = (ctx: Need) => StepResult<Extra> | Promise<StepResult<Extra>>

// A domain result the handler may return instead of a raw value/Response. The
// mapping to a Response is pluggable (see `pipe({ onResult })`).
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

export type ResultMapper<E> = (error: E) => Response

export type PipeOptions<E = never> = {
  // Maps a failed domain Result error into an HTTP Response. Required only if a
  // handler returns Result<_, E>.
  readonly onResult?: ResultMapper<E>
  // Last-resort catch for an unexpected throw in a step or the handler.
  readonly onError?: (error: unknown, req: Request) => Response
}

export type Handler<Ctx, T> = (ctx: Ctx) => T | Response | Promise<T | Response>

// The compiled handler. `params` is supplied by the runtime adapter (the router),
// never by pipeway — pipeway does not route.
export type CompiledHandler<Params> = (req: Request, params: Params) => Promise<Response>

export type Pipeline<Params, Ctx extends BaseCtx<Params>, E> = {
  // `Ctx extends Need ? Step : never` enforces step ORDER at compile time: a step
  // that needs `{ user }` in context cannot be added before the step that adds it.
  use<Need, Extra>(step: Ctx extends Need ? Step<Need, Extra> : never): Pipeline<Params, Ctx & Extra, E>
  // Post-handler Response interceptor (headers, logging, cors).
  transform(fn: (res: Response, ctx: Ctx) => Response | Promise<Response>): Pipeline<Params, Ctx, E>
  handle<T>(handler: Handler<Ctx, T | Result<T, E>>): CompiledHandler<Params>
}
