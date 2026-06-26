---
"pipeway": minor
---

Complete the request lifecycle: add `.map()` (pre-handler context transform),
`.catch()` (exception filters, `@Catch` equivalent), and `.serialize()`
(post-handler JSON body filter), plus `.json(handler, status?)` for declarative
status codes. Execution order is `steps → maps → handler → serializers →
transforms`, with `catch` filters wrapping the run.
