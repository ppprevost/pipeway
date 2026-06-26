// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClientResult } from 'pipeway-client'

import { useMutation, useQuery } from '../src/index'

const okResult = <T,>(data: T): ClientResult<T> => ({ ok: true, status: 200, data })
const errResult = (error: string): ClientResult<never> => ({ ok: false, status: 400, error })

describe('useMutation', () => {
  it('starts idle, then resolves to success with data', async () => {
    const { result } = renderHook(() => useMutation(async (title: string) => okResult({ id: 1, title })))

    expect(result.current.isIdle).toBe(true)

    await act(async () => {
      await result.current.mutateAsync('milk')
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data).toEqual({ id: 1, title: 'milk' })
    expect(result.current.error).toBeUndefined()
  })

  it('exposes the error on a failed result', async () => {
    const { result } = renderHook(() => useMutation(async () => errResult('Nope')))

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error).toBe('Nope')
  })

  it('reset returns to idle', async () => {
    const { result } = renderHook(() => useMutation(async () => okResult(1)))
    await act(async () => {
      await result.current.mutateAsync()
    })
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.reset())
    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})

describe('useQuery', () => {
  it('loads on mount and resolves to data', async () => {
    const { result } = renderHook(() => useQuery(async () => okResult({ name: 'Ada' })))

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ name: 'Ada' })
  })

  it('does not run when disabled, then refetch works', async () => {
    const { result } = renderHook(() => useQuery(async () => okResult(42), { enabled: false }))
    expect(result.current.status).toBe('idle')

    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.data).toBe(42)
  })

  it('surfaces an error result', async () => {
    const { result } = renderHook(() => useQuery(async () => errResult('Boom')))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe('Boom')
  })
})
