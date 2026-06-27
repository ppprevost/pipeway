---
"pipeway-steps": patch
"pipeway-adapter-node": patch
---

Move `pipeway` from `peerDependencies` to `dependencies` (`workspace:^`). This
fixes a changesets quirk where an internal peer dependency would force a spurious
**major** bump on every core release; as a regular internal dependency it now gets
a controlled patch bump with an auto-updated range. No API change.
