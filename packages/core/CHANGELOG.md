# pipeway

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
