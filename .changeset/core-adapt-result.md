---
"pipeway": minor
---

Add `adaptResult` to `pipe()` options — bring-your-own-Result interop. Recognize
and normalize a foreign `Result` shape your handlers return (e.g. a `{ success }`
Result from another codebase) without changing call sites. Mirrors pipeway-next.
