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

  it('exposes params from the runtime adapter', async () => {
    const handler = pipe<{ id: string }>().handle((ctx) => ({ id: ctx.params.id }))
    const res = await handler(req(), { id: 'abc' })
    expect(await res.json()).toEqual({ id: 'abc' })
  })
})
