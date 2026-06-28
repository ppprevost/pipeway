---
"pipeway": minor
---

Add `.stream(handler, init?)` to `pipe()` — terminate a pipeline with a streamed
body. The handler returns a `Response`, a `ReadableStream`, or any
`AsyncIterable<Uint8Array | string>` (e.g. an LLM provider SDK's token stream, no
Vercel AI SDK required). Raw streams/iterables are wrapped in a `Response` with
overridable SSE-flavored default headers; string chunks are UTF-8 encoded;
backpressure and client cancel propagate to the source. Steps still run first, so
auth/rate-limit failures short-circuit before the first chunk. The handler type
forbids returning a `Result`, turning the "wrap a stream in `success()`" footgun
into a compile error. `serialize()` never runs on a stream.
