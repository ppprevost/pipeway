import { ok, fail, type Step } from 'pipeway'
import type { ZodType } from 'zod'

// Generic, app-agnostic steps. Auth / rate-limit are deliberately NOT bundled:
// they depend on your stack. Compose your own the same way these are written.

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

// Validates the JSON body against a Zod schema, adding a typed `body` to ctx.
export const body = <T>(schema: ZodType<T>): Step<{ req: Request }, { body: T }> => async (ctx) => {
  let raw: unknown
  try {
    raw = await ctx.req.json()
  } catch {
    return fail(json({ error: 'InvalidJson' }, 400))
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? ok({ body: parsed.data }) : fail(json({ error: 'ValidationError', issues: parsed.error.issues }, 400))
}

// Validates the URL search params against a Zod schema, adding typed `query`.
export const query = <T>(schema: ZodType<T>): Step<{ req: Request }, { query: T }> => (ctx) => {
  const obj = Object.fromEntries(new URL(ctx.req.url).searchParams)
  const parsed = schema.safeParse(obj)
  return parsed.success ? ok({ query: parsed.data }) : fail(json({ error: 'ValidationError', issues: parsed.error.issues }, 400))
}
