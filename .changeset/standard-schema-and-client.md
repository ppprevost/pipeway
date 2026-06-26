---
"pipeway-steps": minor
"pipeway-client": minor
---

`pipeway-steps`: validation now runs on the Standard Schema spec — `body` and
`query` accept any compliant validator (Zod 3.24+, Valibot, ArkType). The hard
`zod` peer dependency is dropped.

`pipeway-client`: new package — a small, portable, Result-first REST client.
Web-fetch based, never throws, with optional Standard Schema response validation.
