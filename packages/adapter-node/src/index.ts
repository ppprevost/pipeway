import type { IncomingMessage, ServerResponse } from 'node:http'

import type { CompiledHandler } from 'pipeway'

// Bridges the Node `req/res` world (Express, Fastify, http.Server) to the
// Web-standard `Request`/`Response` a pipeway handler speaks. Every OTHER runtime
// (Bun, Deno, Workers, Next, Hono) needs NO adapter — mount the handler directly.

const toWebRequest = (req: IncomingMessage, body: Buffer): Request => {
  const host = req.headers.host ?? 'localhost'
  const url = `http://${host}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }
  const method = req.method ?? 'GET'
  const init: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD' && body.length > 0) {
    // Buffer is an ArrayBufferView; wrap as Uint8Array so it satisfies BodyInit
    // under the DOM lib types while staying zero-copy.
    init.body = new Uint8Array(body)
  }
  return new Request(url, init)
}

const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const sendWebResponse = async (res: ServerResponse, web: Response): Promise<void> => {
  res.statusCode = web.status
  web.headers.forEach((value, key) => res.setHeader(key, value))
  const buf = Buffer.from(await web.arrayBuffer())
  res.end(buf)
}

// Wraps a pipeway handler as an Express/Connect/Node middleware.
// `params` are read from `req.params` (Express) when present.
export const toNode =
  <Params>(handler: CompiledHandler<Params>) =>
  async (req: IncomingMessage & { params?: Params }, res: ServerResponse): Promise<void> => {
    const body = await readBody(req)
    const webReq = toWebRequest(req, body)
    const webRes = await handler(webReq, (req.params ?? ({} as Params)))
    await sendWebResponse(res, webRes)
  }
