/**
 * Service Worker ↔ Vite 미들웨어 브리지.
 *
 * ## 왜 Service Worker 인가
 *
 * 브라우저 안에는 포트가 없다. Vite 는 `middlewareMode: true` 로 켜면 http 서버를
 * 만들지 않고 **connect 미들웨어 스택**(`server.middlewares`)만 남긴다 — 그건 그냥
 * `(req, res, next)` 함수다. Service Worker 가 `/preview/*` 요청을 가로채서 그
 * 스택에 넘기면, iframe 입장에선 진짜 dev server 와 구별되지 않는다.
 *
 * ## 경로
 *
 * ```
 * iframe → fetch /preview/src/main.tsx
 *   → SW (fetch 가로챔)
 *     → 페이지 (client.postMessage + MessageChannel)
 *       → 워커 (Vite 미들웨어)
 *         → 응답 → 역순으로 되돌아감
 * ```
 *
 * SW 는 dedicated worker 와 직접 대화할 수 없어서 페이지를 거친다.
 *
 * ## req/res 흉내
 *
 * connect 는 Node 의 IncomingMessage/ServerResponse 를 기대한다. 실제로 쓰는 건
 * 극히 일부(`url`, `method`, `headers`, `statusCode`, `setHeader`, `end`, `write`)
 * 라서 그것만 흉내내면 된다.
 */

/** 워커가 받는 요청. */
export interface BridgeRequest {
  id: string
  method: string
  url: string
  headers: Record<string, string>
}

/** 워커가 돌려주는 응답. */
export interface BridgeResponse {
  id: string
  status: number
  headers: Record<string, string>
  body: string | null
}

/** connect 미들웨어 스택 — `server.middlewares` 의 최소 형태. */
export interface MiddlewareStack {
  (req: unknown, res: unknown, next: (err?: unknown) => void): void
}

/**
 * Vite 의 connect 스택에 가짜 요청을 흘려보내고 응답을 받는다.
 *
 * connect 가 실제로 만지는 필드만 흉내낸다. 스택이 아무도 응답하지 않으면
 * (`next()` 로 끝까지 감) 404 를 돌려준다.
 */
export function runMiddlewares(
  middlewares: MiddlewareStack,
  req: BridgeRequest,
): Promise<BridgeResponse> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    const headers: Record<string, string> = {}
    let settled = false

    const finish = (status: number, body: string | null): void => {
      if (settled) return
      settled = true
      resolve({ id: req.id, status, headers, body })
    }

    const fakeReq = {
      url: req.url,
      originalUrl: req.url,
      method: req.method,
      headers: req.headers,
      // connect 의 일부 미들웨어가 스트림처럼 다룬다
      on() {},
      once() {},
      removeListener() {},
      setEncoding() {},
      resume() {},
      pause() {},
      destroy() {},
      socket: { remoteAddress: '127.0.0.1', encrypted: false },
      complete: true,
      httpVersion: '1.1',
    }

    const fakeRes = {
      statusCode: 200,
      statusMessage: 'OK',
      headersSent: false,
      finished: false,
      writableEnded: false,
      getHeader: (k: string) => headers[k.toLowerCase()],
      getHeaders: () => headers,
      getHeaderNames: () => Object.keys(headers),
      hasHeader: (k: string) => k.toLowerCase() in headers,
      setHeader(k: string, v: unknown) {
        headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
        return this
      },
      removeHeader(k: string) {
        delete headers[k.toLowerCase()]
      },
      writeHead(status: number, maybeHeaders?: Record<string, unknown>) {
        this.statusCode = status
        if (maybeHeaders) {
          for (const [k, v] of Object.entries(maybeHeaders)) this.setHeader(k, v)
        }
        this.headersSent = true
        return this
      },
      write(chunk: unknown) {
        if (chunk != null) chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
        return true
      },
      end(chunk?: unknown) {
        if (chunk != null && typeof chunk !== 'function') {
          chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
        }
        this.finished = true
        this.writableEnded = true
        finish(this.statusCode, chunks.join(''))
      },
      on() {},
      once() {},
      removeListener() {},
      emit() {},
      destroy() {},
    }

    try {
      middlewares(fakeReq, fakeRes, (err?: unknown) => {
        // 아무 미들웨어도 응답하지 않았다
        if (err) finish(500, String((err as Error)?.stack ?? err))
        else finish(404, 'Not Found')
      })
    } catch (err) {
      finish(500, String((err as Error)?.stack ?? err))
    }
  })
}
