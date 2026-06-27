import { describe, it, expect } from 'vitest'
import { z } from 'zod'

import { createClient, unwrap, ClientError } from '../src/index'

describe('unwrap', () => {
  it('returns data on ok', () => {
    expect(unwrap({ ok: true, status: 200, data: { id: 1 } })).toEqual({ id: 1 })
  })

  it('throws ClientError on failure (for queryFn / fetcher interop)', () => {
    try {
      unwrap({ ok: false, status: 404, error: 'NotFound', body: { detail: 'x' } })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ClientError)
      expect((e as ClientError).status).toBe(404)
      expect((e as ClientError).body).toEqual({ detail: 'x' })
    }
  })
})

// A fake fetch that records the request and returns a scripted Response.
const stub = (response: Response, capture?: (req: { url: string; init: RequestInit | undefined }) => void): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    capture?.({ url: String(url), init })
    return response
  }) as unknown as typeof fetch

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

describe('createClient', () => {
  it('GET returns ok with typed data', async () => {
    const client = createClient({ baseUrl: 'https://api.test', fetch: stub(json({ id: 1 })) })
    const res = await client.get<{ id: number }>('/todos/1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toEqual({ id: 1 })
  })

  it('builds URL with query params and base path', async () => {
    let seen = ''
    const client = createClient({ baseUrl: 'https://api.test/v1', fetch: stub(json({}), (r) => (seen = r.url)) })
    await client.get('/todos', { query: { page: 2, q: 'milk', skip: undefined } })
    expect(seen).toBe('https://api.test/v1/todos?page=2&q=milk')
  })

  it('POST serializes the body as JSON', async () => {
    let body: unknown
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: stub(json({ ok: true }, 201), (r) => (body = r.init?.body)),
    })
    const res = await client.post('/todos', { body: { title: 'x' } })
    expect(body).toBe(JSON.stringify({ title: 'x' }))
    expect(res.status).toBe(201)
  })

  it('maps a non-2xx response to ok:false with the parsed body', async () => {
    const client = createClient({ baseUrl: 'https://api.test', fetch: stub(json({ error: 'Nope' }, 404)) })
    const res = await client.get('/missing')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Nope' })
    }
  })

  it('validates the response against a Standard Schema', async () => {
    const client = createClient({ baseUrl: 'https://api.test', fetch: stub(json({ id: 'not-a-number' })) })
    const res = await client.get('/todos/1', { schema: z.object({ id: z.number() }) })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('ResponseValidationError')
  })

  it('never throws on a network failure', async () => {
    const boom = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', fetch: boom })
    const res = await client.get('/x')
    expect(res).toMatchObject({ ok: false, status: 0, error: 'offline' })
  })
})
