import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientResult } from 'pipeway-client'

// React hooks over a Result-first client. Because the client never throws, the
// hooks expose a typed { data, error, status } derived from ClientResult — no
// try/catch, no thrown-promise dance. Zero deps beyond React.

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

const useIsMounted = () => {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

// ---------- useQuery -----------------------------------------------------------

export type UseQueryResult<T> = {
  data: T | undefined
  error: string | undefined
  status: AsyncStatus
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  refetch: () => Promise<void>
}

export type UseQueryOptions = {
  // When false, the query does not run until enabled becomes true.
  enabled?: boolean
  // Re-runs the query when any value here changes (like a dependency array).
  deps?: ReadonlyArray<unknown>
}

export const useQuery = <T>(
  fetcher: () => Promise<ClientResult<T>>,
  options: UseQueryOptions = {},
): UseQueryResult<T> => {
  const { enabled = true, deps = [] } = options
  const mounted = useIsMounted()
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<AsyncStatus>(enabled ? 'loading' : 'idle')

  const run = useCallback(async () => {
    setStatus('loading')
    setError(undefined)
    const result = await fetcher()
    if (!mounted.current) {
      return
    }
    if (result.ok) {
      setData(result.data)
      setStatus('success')
    } else {
      setError(result.error)
      setStatus('error')
    }
    // fetcher identity is intentionally not a dep — callers pass an inline closure;
    // re-run is controlled by `deps`.
  }, deps)

  useEffect(() => {
    if (enabled) {
      void run()
    }
  }, [enabled, run])

  return {
    data,
    error,
    status,
    isLoading: status === 'loading',
    isSuccess: status === 'success',
    isError: status === 'error',
    refetch: run,
  }
}

// ---------- useMutation --------------------------------------------------------

export type UseMutationResult<Args extends ReadonlyArray<unknown>, T> = {
  mutate: (...args: Args) => void
  mutateAsync: (...args: Args) => Promise<ClientResult<T>>
  data: T | undefined
  error: string | undefined
  status: AsyncStatus
  isIdle: boolean
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  reset: () => void
}

export const useMutation = <Args extends ReadonlyArray<unknown>, T>(
  mutator: (...args: Args) => Promise<ClientResult<T>>,
): UseMutationResult<Args, T> => {
  const mounted = useIsMounted()
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<AsyncStatus>('idle')

  const mutateAsync = useCallback(
    async (...args: Args): Promise<ClientResult<T>> => {
      setStatus('loading')
      setError(undefined)
      const result = await mutator(...args)
      if (mounted.current) {
        if (result.ok) {
          setData(result.data)
          setStatus('success')
        } else {
          setError(result.error)
          setStatus('error')
        }
      }
      return result
    },
    [],
  )

  const mutate = useCallback(
    (...args: Args) => {
      void mutateAsync(...args)
    },
    [mutateAsync],
  )

  const reset = useCallback(() => {
    setData(undefined)
    setError(undefined)
    setStatus('idle')
  }, [])

  return {
    mutate,
    mutateAsync,
    data,
    error,
    status,
    isIdle: status === 'idle',
    isPending: status === 'loading',
    isSuccess: status === 'success',
    isError: status === 'error',
    reset,
  }
}
