# pipeway

## 0.3.0

### Minor Changes

- 9739924: Add `adaptResult` to `pipe()` options — bring-your-own-Result interop. Recognize
  and normalize a foreign `Result` shape your handlers return (e.g. a `{ success }`
  Result from another codebase) without changing call sites. Mirrors pipeway-next.
- 506957e: Add `.stream(handler, init?)` to `pipe()` — terminate a pipeline with a streamed
  body. The handler returns a `Response`, a `ReadableStream`, or any
  `AsyncIterable<Uint8Array | string>` (e.g. an LLM provider SDK's token stream, no
  Vercel AI SDK required). Raw streams/iterables are wrapped in a `Response` with
  overridable SSE-flavored default headers; string chunks are UTF-8 encoded;
  backpressure and client cancel propagate to the source. Steps still run first, so
  auth/rate-limit failures short-circuit before the first chunk. The handler type
  forbids returning a `Result`, turning the "wrap a stream in `success()`" footgun
  into a compile error. `serialize()` never runs on a stream.

## 0.2.0

### Minor Changes

- 32dc013: Complete the request lifecycle: add `.map()` (pre-handler context transform),
  `.catch()` (exception filters, `@Catch` equivalent), and `.serialize()`
  (post-handler JSON body filter), plus `.json(handler, status?)` for declarative
  status codes. Execution order is `steps → maps → handler → serializers →
transforms`, with `catch` filters wrapping the run.

## 0.1.0

### Minor Changes

- 91e741f: Initial release: portable typed request pipeline on Web-standard Request/Response.
  Core engine with compile-time step ordering and branded Result mapping, generic Zod
  steps (`body`, `query`), and a Node/Express adapter.
