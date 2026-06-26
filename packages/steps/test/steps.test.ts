import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import * as v from 'valibot'

import { body, query } from '../src/index'

const post = (data: unknown) =>
  new Request('https://x.test/', { method: 'POST', body: JSON.stringify(data), headers: { 'content-type': 'application/json' } })

describe('body (Standard Schema)', () => {
  it('accepts a valid body with a Zod schema', async () => {
    const step = body(z.object({ title: z.string() }))
    const res = await step({ req: post({ title: 'hi' }) })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.extra.body).toEqual({ title: 'hi' })
  })

  it('accepts a valid body with a Valibot schema (no Zod)', async () => {
    const step = body(v.object({ title: v.string() }))
    const res = await step({ req: post({ title: 'hi' }) })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.extra.body).toEqual({ title: 'hi' })
  })

  it('fails with 400 ValidationError on a bad body', async () => {
    const step = body(z.object({ title: z.string() }))
    const res = await step({ req: post({ title: 123 }) })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      expect(await res.response.json()).toMatchObject({ error: 'ValidationError' })
    }
  })

  it('fails with 400 InvalidJson when the body is not JSON', async () => {
    const step = body(z.object({ title: z.string() }))
    const req = new Request('https://x.test/', { method: 'POST', body: 'not json' })
    const res = await step({ req })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      expect(await res.response.json()).toEqual({ error: 'InvalidJson' })
    }
  })
})

describe('query (Standard Schema)', () => {
  it('coerces and validates search params (Zod)', async () => {
    const step = query(z.object({ page: z.coerce.number() }))
    const res = await step({ req: new Request('https://x.test/?page=3') })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.extra.query).toEqual({ page: 3 })
  })
})
