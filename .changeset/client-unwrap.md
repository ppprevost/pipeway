---
"pipeway-client": minor
---

Add `unwrap(result)` (and `ClientError`): turns a `ClientResult<T>` into `T`,
throwing on failure — the one-line bridge to throw-based data libraries (TanStack
Query, SWR). pipeway ships no custom React hooks; compose with your data library.
