# API reference

Everything pipeway exports, across three packages.

## `pipeway`

The core. A pipeline builder and the constructors for its results.

| Export | Kind | Summary |
| --- | --- | --- |
| [`pipe(options?)`](/api/pipe#pipe-fn) | function | Create a pipeline. |
| [`.use(step)`](/api/pipe#use) | method | Add a step; enriches the typed context. |
| [`.transform(fn)`](/api/pipe#transform) | method | Post-handler Response interceptor. |
| [`.handle(handler)`](/api/pipe#handle) | method | Terminate the pipeline into a handler. |
| [`ok(extra)`](/api/pipe#ok-fail) | function | A step that succeeds, adding `extra` to context. |
| [`fail(response)`](/api/pipe#ok-fail) | function | A step that short-circuits with a Response. |
| [`success(value)`](/api/result#success-failure) | function | A successful domain `Result`. |
| [`failure(error)`](/api/result#success-failure) | function | A failed domain `Result`. |

Types: [`Step`](/api/pipe#type-step), [`BaseCtx`](/api/pipe#type-basectx),
[`StepResult`](/api/pipe#type-stepresult), [`PipeOptions`](/api/pipe#type-pipeoptions),
[`Handler`](/api/pipe#type-handler), [`CompiledHandler`](/api/pipe#type-compiledhandler),
[`Result`](/api/result#type-result), [`ResultMapper`](/api/result#type-resultmapper).

## `pipeway-steps`

Generic, framework-agnostic Zod steps.

| Export | Summary |
| --- | --- |
| [`body(schema)`](/api/steps#body) | Validate the JSON body → typed `ctx.body`. |
| [`query(schema)`](/api/steps#query) | Validate the search params → typed `ctx.query`. |

## `pipeway-adapter-node`

| Export | Summary |
| --- | --- |
| [`toNode(handler)`](/api/adapters#tonode) | Run a pipeway handler as Express/Node middleware. |

## Mental model

```
pipe(options)
  .use(stepA)        // ctx: BaseCtx & A
  .use(stepB)        // ctx: BaseCtx & A & B   (B may require A — enforced by types)
  .transform(fn)     // intercept the Response
  .handle(handler)   // → (req: Request, params) => Promise<Response>
```

A **step** returns `ok(extra)` (continue, merge `extra` into context) or
`fail(response)` (stop, return that Response). The **handler** returns a value
(serialized to JSON), a `Response`, or a domain `Result` (mapped via `onResult`).
