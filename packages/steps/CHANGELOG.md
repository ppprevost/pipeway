# pipeway-steps

## 1.0.1

### Patch Changes

- 2174cb2: Move `pipeway` from `peerDependencies` to `dependencies` (`workspace:^`). This
  fixes a changesets quirk where an internal peer dependency would force a spurious
  **major** bump on every core release; as a regular internal dependency it now gets
  a controlled patch bump with an auto-updated range. No API change.

## 1.0.0

### Minor Changes

- 6f1f17d: `pipeway-steps`: validation now runs on the Standard Schema spec — `body` and
  `query` accept any compliant validator (Zod 3.24+, Valibot, ArkType). The hard
  `zod` peer dependency is dropped.

  `pipeway-client`: new package — a small, portable, Result-first REST client.
  Web-fetch based, never throws, with optional Standard Schema response validation.

### Patch Changes

- Updated dependencies [32dc013]
  - pipeway@0.2.0

## 0.1.0

### Minor Changes

- 91e741f: Initial release: portable typed request pipeline on Web-standard Request/Response.
  Core engine with compile-time step ordering and branded Result mapping, generic Zod
  steps (`body`, `query`), and a Node/Express adapter.

### Patch Changes

- Updated dependencies [91e741f]
  - pipeway@0.1.0
