---
"pipeway-next": minor
---

Add `adaptResult` option — bring-your-own-Result interop. Recognize and normalize
a foreign `Result` shape your handlers return (e.g. a `{ success }`-shaped Result
from another codebase) without changing call sites.
