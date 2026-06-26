import { ok, fail, type Step } from 'pipeway'
import type { StandardSchemaV1 } from '@standard-schema/spec'

// Validation steps built on the Standard Schema spec — they accept ANY validator
// that implements it: Zod 3.24+, Valibot, ArkType, etc. No lock-in to one library.
// Auth / rate-limit are deliberately NOT bundled: they depend on your stack.

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

type Issues = ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }>

const toIssues = (issues: ReadonlyArray<StandardSchemaV1.Issue>): Issues =>
  issues.map((i) => ({
    message: i.message,
    ...(i.path ? { path: i.path.map((p) => (typeof p === 'object' ? p.key : p)) } : {}),
  }))

const validate = async <T>(
  schema: StandardSchemaV1<unknown, T>,
  value: unknown,
): Promise<{ ok: true; value: T } | { ok: false; issues: Issues }> => {
  let result = schema['~standard'].validate(value)
  if (result instanceof Promise) {
    result = await result
  }
  return result.issues ? { ok: false, issues: toIssues(result.issues) } : { ok: true, value: result.value }
}

// Reads the request's JSON body, validates it, and adds a typed `ctx.body`.
export const body = <T>(schema: StandardSchemaV1<unknown, T>): Step<{ req: Request }, { body: T }> => async (ctx) => {
  let raw: unknown
  try {
    raw = await ctx.req.json()
  } catch {
    return fail(json({ error: 'InvalidJson' }, 400))
  }
  const result = await validate(schema, raw)
  return result.ok ? ok({ body: result.value }) : fail(json({ error: 'ValidationError', issues: result.issues }, 400))
}

// Validates the URL search params (flat object) and adds a typed `ctx.query`.
export const query = <T>(schema: StandardSchemaV1<unknown, T>): Step<{ req: Request }, { query: T }> => async (ctx) => {
  const obj = Object.fromEntries(new URL(ctx.req.url).searchParams)
  const result = await validate(schema, obj)
  return result.ok ? ok({ query: result.value }) : fail(json({ error: 'ValidationError', issues: result.issues }, 400))
}
