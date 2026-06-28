import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

import { action, input, ok, fail, success, failure } from '../src/index'

describe('action', () => {
  it('runs steps and returns ok with data', async () => {
    const run = action<{ title: string }>()
      .use((ctx: { input: { title: string } }) => ok({ upper: ctx.input.title.toUpperCase() }))
      .handle((ctx) => ({ title: ctx.upper }))

    expect(await run({ title: 'milk' })).toEqual({ ok: true, data: { title: 'MILK' } })
  })

  it('short-circuits when a step fails', async () => {
    const run = action()
      .use(() => fail('Unauthorized'))
      .handle(() => ({ never: true }))

    expect(await run()).toEqual({ ok: false, error: 'Unauthorized' })
  })

  it('validates input with a Standard Schema step', async () => {
    const run = action<unknown>()
      .use(input(z.object({ title: z.string().min(1) })))
      .handle((ctx) => ({ saved: ctx.data.title }))

    expect(await run({ title: 'x' })).toEqual({ ok: true, data: { saved: 'x' } })
    const bad = await run({ title: '' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toBe('ValidationError')
  })

  it('maps a failed domain Result via onResult', async () => {
    const run = action<void, 'NotFound'>({ onResult: (e) => `mapped:${e}` }).handle(() => failure('NotFound' as const))
    expect(await run()).toEqual({ ok: false, error: 'mapped:NotFound' })
  })

  it('returns success(value) as data', async () => {
    const run = action().handle(() => success({ id: 1 }))
    expect(await run()).toEqual({ ok: true, data: { id: 1 } })
  })

  it('revalidates injected paths only on success', async () => {
    const revalidate = vi.fn()
    const run = action({ revalidate }).revalidate('/todos', '/').handle(() => ({ done: true }))
    await run()
    expect(revalidate).toHaveBeenCalledWith('/todos')
    expect(revalidate).toHaveBeenCalledWith('/')
    expect(revalidate).toHaveBeenCalledTimes(2)
  })

  it('does not revalidate when a step fails', async () => {
    const revalidate = vi.fn()
    const run = action({ revalidate })
      .revalidate('/todos')
      .use(() => fail('Nope'))
      .handle(() => ({ done: true }))
    await run()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('adaptResult converts a foreign Result shape ({ success })', async () => {
    type Foreign<T> = { success: true; data: T } | { success: false; error: string }
    const isForeign = (v: unknown): v is Foreign<unknown> =>
      typeof v === 'object' && v !== null && 'success' in v

    const run = action<void, string>({
      onResult: (e) => `mapped:${e}`,
      adaptResult: (out) =>
        isForeign(out) ? (out.success ? { ok: true, value: out.data } : { ok: false, error: out.error }) : null,
    }).handle((): Foreign<{ id: number }> => ({ success: false, error: 'Nope' }))

    expect(await run()).toEqual({ ok: false, error: 'mapped:Nope' })

    const okRun = action<void, string>({
      adaptResult: (out) => {
        const f = out as Foreign<{ id: number }>
        return f.success ? { ok: true, value: f.data } : { ok: false, error: f.error }
      },
    }).handle((): Foreign<{ id: number }> => ({ success: true, data: { id: 1 } }))
    expect(await okRun()).toEqual({ ok: true, data: { id: 1 } })
  })

  it('never throws — wraps a thrown handler as InternalError', async () => {
    const run = action().handle(() => {
      throw new Error('boom')
    })
    const res = await run()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('InternalError')
  })

  it('calls onError with the error and meta, masks without leaking the message', async () => {
    const seen: Array<{ error: unknown; name: string | undefined }> = []
    const run = action({ onError: (error, meta) => seen.push({ error, name: meta.name }) })
      .meta({ name: 'createTodo' })
      .handle(() => {
        throw new Error('boom')
      })

    const res = await run()
    // The raw message never reaches the client — only the masked error.
    expect(res).toEqual({ ok: false, error: 'InternalError' })
    expect(seen).toHaveLength(1)
    const first = seen[0]
    expect((first?.error as Error).message).toBe('boom')
    expect(first?.name).toBe('createTodo')
  })

  it('lets onError re-throw (control-flow) escape the action', async () => {
    const redirect = new Error('NEXT_REDIRECT')
    const run = action({
      onError: (error) => {
        // mimic next's unstable_rethrow for navigation control-flow
        if ((error as Error).message === 'NEXT_REDIRECT') throw error
      },
    }).handle(() => {
      throw redirect
    })

    await expect(run()).rejects.toThrow('NEXT_REDIRECT')
  })

  it('fail() attaches fieldErrors and retryAfter', async () => {
    const validation = action()
      .use(() => fail('ValidationError', { fieldErrors: { title: 'required' }, meta: ['raw'] }))
      .handle(() => ({ never: true }))
    expect(await validation()).toEqual({
      ok: false,
      error: 'ValidationError',
      fieldErrors: { title: 'required' },
      meta: ['raw'],
    })

    const throttled = action()
      .use(() => fail('RateLimitedError', { retryAfter: 42 }))
      .handle(() => ({ never: true }))
    expect(await throttled()).toEqual({ ok: false, error: 'RateLimitedError', retryAfter: 42 })
  })
})
