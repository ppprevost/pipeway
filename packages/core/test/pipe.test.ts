import { describe, it, expect } from 'vitest'

import { pipe, ok, fail, failure } from '../src/index'

const req = (url = 'https://x.test/') => new Request(url)

describe('pipe', () => {
  it('runs steps, enriches context, returns JSON from a raw value', async () => {
    const handler = pipe()
      .use(() => ok({ who: 'world' }))
      .handle((ctx) => ({ hello: ctx.who }))

    const res = await handler(req(), {})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hello: 'world' })
  })

  it('short-circuits when a step fails, skipping the handler', async () => {
    let handlerRan = false
    const handler = pipe()
      .use(() => fail(new Response('nope', { status: 401 })))
      .handle(() => {
        handlerRan = true
        return { ok: true }
      })

    const res = await handler(req(), {})
    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('passes a returned Response through untouched', async () => {
    const handler = pipe().handle(() => new Response('raw', { status: 201 }))
    const res = await handler(req(), {})
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('raw')
  })

  it('maps a failed domain Result via onResult', async () => {
    const handler = pipe<Record<never, never>, 'NotFound'>({
      onResult: (e) => new Response(e, { status: 404 }),
    }).handle(() => failure('NotFound' as const))

    const res = await handler(req(), {})
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('NotFound')
  })

  it('applies transforms to the final response', async () => {
    const handler = pipe()
      .transform((res) => {
        res.headers.set('x-pipeway', '1')
        return res
      })
      .handle(() => ({ ok: true }))

    const res = await handler(req(), {})
    expect(res.headers.get('x-pipeway')).toBe('1')
  })

  it('catches an unexpected throw via onError', async () => {
    const handler = pipe({ onError: () => new Response('boom', { status: 500 }) }).handle(() => {
      throw new Error('kaboom')
    })

    const res = await handler(req(), {})
    expect(res.status).toBe(500)
  })

  it('.json serializes a value with a custom default status', async () => {
    const handler = pipe().json(() => ({ created: true }), 201)
    const res = await handler(req(), {})
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ created: true })
  })

  it('.json defaults to 200 and still passes a Response through', async () => {
    const ok200 = await pipe().json(() => ({ a: 1 }))(req(), {})
    expect(ok200.status).toBe(200)
    const raw = await pipe().json(() => new Response('x', { status: 418 }))(req(), {})
    expect(raw.status).toBe(418)
  })

  it('exposes params from the runtime adapter', async () => {
    const handler = pipe<{ id: string }>().handle((ctx) => ({ id: ctx.params.id }))
    const res = await handler(req(), { id: 'abc' })
    expect(await res.json()).toEqual({ id: 'abc' })
  })

  it('.map transforms the context before the handler', async () => {
    const handler = pipe()
      .use(() => ok({ name: '  Ada  ' }))
      .map((ctx) => ({ ...ctx, name: ctx.name.trim() }))
      .handle((ctx) => ({ name: ctx.name }))
    const res = await handler(req(), {})
    expect(await res.json()).toEqual({ name: 'Ada' })
  })

  it('.catch handles a thrown error via the first matching filter', async () => {
    const handler = pipe()
      .catch((err) => (err instanceof RangeError ? new Response('range', { status: 416 }) : null))
      .catch(() => new Response('fallback', { status: 500 }))
      .handle(() => {
        throw new RangeError('x')
      })
    const res = await handler(req(), {})
    expect(res.status).toBe(416)
    expect(await res.text()).toBe('range')
  })

  it('.serialize strips fields from a JSON response body', async () => {
    const handler = pipe()
      .serialize((body) => {
        const { password: _pw, ...rest } = body as Record<string, unknown>
        return rest
      })
      .handle(() => ({ id: 1, name: 'Ada', password: 'secret' }))
    const res = await handler(req(), {})
    expect(await res.json()).toEqual({ id: 1, name: 'Ada' })
  })

  it('adaptResult converts a foreign Result shape ({ success })', async () => {
    type Foreign = { success: true; data: unknown } | { success: false; error: string }
    const handler = pipe<Record<never, never>, string>({
      onResult: (e) => new Response(e, { status: 422 }),
      adaptResult: (out) => {
        const f = out as Foreign
        if (typeof f !== 'object' || f === null || !('success' in f)) return null
        return f.success ? { ok: true, value: f.data } : { ok: false, error: f.error }
      },
    }).handle((): Foreign => ({ success: false, error: 'Bad' }))

    const res = await handler(req(), {})
    expect(res.status).toBe(422)
    expect(await res.text()).toBe('Bad')
  })

  it('.serialize leaves a non-JSON response untouched', async () => {
    const handler = pipe()
      .serialize(() => ({ tampered: true }))
      .handle(() => new Response('plain', { status: 200 }))
    const res = await handler(req(), {})
    expect(await res.text()).toBe('plain')
  })
})

describe('pipe.stream', () => {
  const drain = async (res: Response): Promise<string> => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let out = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      out += decoder.decode(value, { stream: true })
    }
    return out
  }

  it('streams an AsyncIterable of strings with default SSE headers', async () => {
    async function* gen() {
      yield 'data: a\n\n'
      yield 'data: b\n\n'
    }
    const handler = pipe().stream(() => gen())
    const res = await handler(req(), {})

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(await drain(res)).toBe('data: a\n\ndata: b\n\n')
  })

  it('wraps a raw ReadableStream', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('chunk1')
        controller.enqueue('chunk2')
        controller.close()
      },
    })
    const handler = pipe().stream(() => stream)
    const res = await handler(req(), {})
    expect(await drain(res)).toBe('chunk1chunk2')
  })

  it('passes a returned Response through, keeping its own headers', async () => {
    const handler = pipe().stream(
      () => new Response('raw', { status: 207, headers: { 'content-type': 'text/plain' } }),
    )
    const res = await handler(req(), {})
    expect(res.status).toBe(207)
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(await res.text()).toBe('raw')
  })

  it('lets init override the default headers', async () => {
    async function* gen() {
      yield 'x'
    }
    const handler = pipe().stream(() => gen(), {
      status: 201,
      headers: { 'content-type': 'application/x-ndjson' },
    })
    const res = await handler(req(), {})
    expect(res.status).toBe(201)
    expect(res.headers.get('content-type')).toBe('application/x-ndjson')
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform')
  })

  it('short-circuits a failing step before streaming', async () => {
    let handlerRan = false
    const handler = pipe()
      .use(() => fail(new Response('nope', { status: 429 })))
      .stream(() => {
        handlerRan = true
        return new Response('body')
      })
    const res = await handler(req(), {})
    expect(res.status).toBe(429)
    expect(handlerRan).toBe(false)
  })

  it('cancels the source iterator on consumer cancel', async () => {
    let returned = false
    const iterable: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ value: 'x', done: false }),
          return: async () => {
            returned = true
            return { value: undefined, done: true }
          },
        }
      },
    }
    const handler = pipe().stream(() => iterable)
    const res = await handler(req(), {})
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(returned).toBe(true)
  })

  it('routes a throw before the first chunk through onError', async () => {
    const handler = pipe({ onError: () => new Response('handled', { status: 500 }) }).stream(() => {
      throw new Error('boom')
    })
    const res = await handler(req(), {})
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('handled')
  })

  it('rejects a non-stream return at runtime', async () => {
    // @ts-expect-error stream handler may not return a plain value
    const handler = pipe().stream(() => ({ not: 'a stream' }))
    await expect(handler(req(), {})).rejects.toThrow('must return a Response, ReadableStream, or AsyncIterable')
  })
})
