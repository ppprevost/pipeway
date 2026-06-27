# pipeway-client

## 0.2.0

### Minor Changes

- 9ff3159: Add `unwrap(result)` (and `ClientError`): turns a `ClientResult<T>` into `T`,
  throwing on failure — the one-line bridge to throw-based data libraries (TanStack
  Query, SWR). pipeway ships no custom React hooks; compose with your data library.

## 0.1.0

### Minor Changes

- 6f1f17d: `pipeway-steps`: validation now runs on the Standard Schema spec — `body` and
  `query` accept any compliant validator (Zod 3.24+, Valibot, ArkType). The hard
  `zod` peer dependency is dropped.

  `pipeway-client`: new package — a small, portable, Result-first REST client.
  Web-fetch based, never throws, with optional Standard Schema response validation.
