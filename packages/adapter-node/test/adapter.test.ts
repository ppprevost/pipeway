import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { pipe } from 'pipeway'
import { body } from 'pipeway-steps'
import { z } from 'zod'

import { toNode } from '../src/index'

// Minimal fakes for IncomingMessage / ServerResponse.
const fakeReq = <P = Record<never, never>>(opts: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}) => {
  const stream = Readable.from(opts.body ? [Buffer.from(opts.body)] : [])
  const req = stream as unknown as IncomingMessage & { params?: P }
  req.method = opts.method ?? 'GET'
  req.url = opts.url ?? '/'
  req.headers = { host: 'x.test', ...(opts.headers ?? {}) }
  return req
}

const fakeRes = () => {
  const headers: Record<string, string> = {}
  const state: { statusCode: number; body: string } = { statusCode: 200, body: '' }
  const res = {
    statusCode: 200,
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v
    },
    end: (chunk?: Buffer | string) => {
      state.statusCode = res.statusCode
      state.body = chunk ? chunk.toString() : ''
    },
  } as unknown as ServerResponse
  return { res, headers, state }
}

describe('toNode', () => {
  it('bridges a GET handler to Node res', async () => {
    const handler = pipe<{ id: string }>().handle((ctx) => ({ id: ctx.params.id }))
    const req = fakeReq<{ id: string }>({ method: 'GET', url: '/todos/7' })
    req.params = { id: '7' }
    const { res, state } = fakeRes()

    await toNode(handler)(req, res)
    expect(state.statusCode).toBe(200)
    expect(JSON.parse(state.body)).toEqual({ id: '7' })
  })

  it('passes a JSON POST body through to a validation step', async () => {
    const handler = pipe()
      .use(body(z.object({ title: z.string() })))
      .json(({ body }) => ({ created: body.title }), 201)
    const req = fakeReq({
      method: 'POST',
      url: '/todos',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'milk' }),
    })
    const { res, state } = fakeRes()

    await toNode(handler)(req, res)
    expect(state.statusCode).toBe(201)
    expect(JSON.parse(state.body)).toEqual({ created: 'milk' })
  })
})
