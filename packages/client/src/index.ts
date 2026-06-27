import type { StandardSchemaV1 } from '@standard-schema/spec'

// A small, portable, Result-first REST client. Web-fetch based (runs on Bun, Deno,
// Workers, Node 18+, browsers). Never throws — every call resolves to a
// discriminated ClientResult, mirroring pipeway's server-side ergonomics.

export type ClientResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly body?: unknown }

// Thrown by `unwrap` so the failed ClientResult survives as a typed error.
export class ClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ClientError'
  }
}

// Turns a ClientResult into its data, throwing ClientError on failure. This is the
// bridge to throw-based data libraries: drop it in a TanStack Query `queryFn` or a
// SWR fetcher — `() => api.get('/todos').then(unwrap)`.
export const unwrap = <T>(result: ClientResult<T>): T => {
  if (!result.ok) {
    throw new ClientError(result.status, result.error, result.body)
  }
  return result.data
}

export type RequestOptions<T> = {
  readonly query?: Record<string, string | number | boolean | null | undefined>
  readonly body?: unknown
  readonly headers?: Record<string, string>
  // Optional Standard Schema (Zod / Valibot / ArkType) to validate + type the response.
  readonly schema?: StandardSchemaV1<unknown, T>
  readonly signal?: AbortSignal
}

export type ClientConfig = {
  readonly baseUrl: string
  readonly headers?: Record<string, string>
  // Inject a custom fetch (testing, retries, auth refresh). Defaults to global fetch.
  readonly fetch?: typeof fetch
}

const buildUrl = (baseUrl: string, path: string, query?: RequestOptions<unknown>['query']): string => {
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

const validateResponse = async <T>(schema: StandardSchemaV1<unknown, T>, value: unknown): Promise<ClientResult<T>> => {
  let result = schema['~standard'].validate(value)
  if (result instanceof Promise) {
    result = await result
  }
  return result.issues
    ? { ok: false, status: 200, error: 'ResponseValidationError', body: result.issues }
    : { ok: true, status: 200, data: result.value }
}

const request = async <T>(
  config: ClientConfig,
  method: string,
  path: string,
  options: RequestOptions<T> = {},
): Promise<ClientResult<T>> => {
  const doFetch = config.fetch ?? fetch
  const headers: Record<string, string> = { ...config.headers, ...options.headers }
  const init: RequestInit = { method, headers }
  if (options.signal) {
    init.signal = options.signal
  }
  if (options.body !== undefined) {
    headers['content-type'] ??= 'application/json'
    init.body = JSON.stringify(options.body)
  }

  let res: Response
  try {
    res = await doFetch(buildUrl(config.baseUrl, path, options.query), init)
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : 'NetworkError' }
  }

  const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
  const parsed: unknown = isJson ? await res.json().catch(() => undefined) : await res.text().catch(() => undefined)

  if (!res.ok) {
    return { ok: false, status: res.status, error: res.statusText || 'RequestFailed', body: parsed }
  }
  if (options.schema) {
    const validated = await validateResponse(options.schema, parsed)
    return validated.ok ? { ...validated, status: res.status } : validated
  }
  return { ok: true, status: res.status, data: parsed as T }
}

export type Client = {
  get<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ClientResult<T>>
  post<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ClientResult<T>>
  put<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ClientResult<T>>
  patch<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ClientResult<T>>
  delete<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ClientResult<T>>
}

export const createClient = (config: ClientConfig): Client => ({
  get: (path, options) => request(config, 'GET', path, options),
  post: (path, options) => request(config, 'POST', path, options),
  put: (path, options) => request(config, 'PUT', path, options),
  patch: (path, options) => request(config, 'PATCH', path, options),
  delete: (path, options) => request(config, 'DELETE', path, options),
})
