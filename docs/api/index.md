# API reference

Everything pipeway exports, across three packages.

## `pipeway`

The core. A pipeline builder and the constructors for its results.

| Export | Kind | Summary |
| --- | --- | --- |
| [`pipe(options?)`](/api/pipe#pipe-fn) | function | Create a pipeline. |
| [`.use(step)`](/api/pipe#use) | method | Add a step (guard); enriches the typed context. |
| [`.map(fn)`](/api/pipe#map) | method | Pre-handler context transform. |
| [`.catch(catcher)`](/api/pipe#catch) | method | Exception filter (`@Catch` equivalent). |
| [`.serialize(fn)`](/api/pipe#serialize) | method | Post-handler JSON body filter (strip fields). |
| [`.transform(fn)`](/api/pipe#transform) | method | Post-handler Response interceptor. |
| [`.handle(handler)`](/api/pipe#handle) | method | Terminate the pipeline into a handler. |
| [`.json(handler, status?)`](/api/pipe#json) | method | Terminate, serializing values with a default status. |
| [`ok(extra)`](/api/pipe#ok-fail) | function | A step that succeeds, adding `extra` to context. |
| [`fail(response)`](/api/pipe#ok-fail) | function | A step that short-circuits with a Response. |
| [`success(value)`](/api/result#success-failure) | function | A successful domain `Result`. |
| [`failure(error)`](/api/result#success-failure) | function | A failed domain `Result`. |

Types: [`Step`](/api/pipe#type-step), [`BaseCtx`](/api/pipe#type-basectx),
[`StepResult`](/api/pipe#type-stepresult), [`PipeOptions`](/api/pipe#type-pipeoptions),
[`Handler`](/api/pipe#type-handler), [`CompiledHandler`](/api/pipe#type-compiledhandler),
[`Result`](/api/result#type-result), [`ResultMapper`](/api/result#type-resultmapper).

## `pipeway-steps`

Generic, framework-agnostic Standard Schema steps (Zod / Valibot / ArkType).

| Export | Summary |
| --- | --- |
| [`body(schema)`](/api/steps#body) | Validate the JSON body → typed `ctx.body`. |
| [`query(schema)`](/api/steps#query) | Validate the search params → typed `ctx.query`. |

## `pipeway-adapter-node`

| Export | Summary |
| --- | --- |
| [`toNode(handler)`](/api/adapters#tonode) | Run a pipeway handler as Express/Node middleware. |

## `pipeway-client`

A portable, Result-first REST client (optional Standard Schema validation).

| Export | Summary |
| --- | --- |
| [`createClient(config)`](/api/client#createclient) | Create a typed `get`/`post`/… client. |

## `pipeway-react`

React hooks over the client.

| Export | Summary |
| --- | --- |
| [`useMutation(fn)`](/api/react#usemutation) | Result-first write hook. |
| [`useQuery(fetcher, opts?)`](/api/react#usequery) | Read hook (runs on mount, refetch). |

## Mental model

```
pipe(options)
  .use(stepA)        // guard → ctx: BaseCtx & A
  .use(stepB)        // guard → ctx: BaseCtx & A & B  (B may require A — enforced by types)
  .map(fn)           // pre-handler ctx transform
  .catch(filter)     // exception filter (@Catch)
  .serialize(fn)     // post-handler JSON body filter (strip fields)
  .transform(fn)     // post-handler Response interceptor
  .handle(handler)   // → (req: Request, params) => Promise<Response>
```

Execution order: `steps → maps → handler → serializers → transforms`, with
`catch` filters wrapping the whole run.

A **step** returns `ok(extra)` (continue, merge `extra` into context) or
`fail(response)` (stop, return that Response). The **handler** returns a value
(serialized to JSON), a `Response`, or a domain `Result` (mapped via `onResult`).
