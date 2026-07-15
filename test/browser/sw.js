// Service Worker — 프리뷰 iframe 의 요청을 워커의 Vite 미들웨어로 넘긴다.
// SW 는 dedicated worker 와 직접 대화할 수 없으므로 페이지를 거친다:
//   iframe fetch → SW → 페이지(client) → 워커(Vite) → 역순 반환
//
// ⚠️ **경로가 아니라 요청한 클라이언트로 라우팅한다.**
// Vite 가 서빙하는 HTML 은 `<script src="/src/main.tsx">` 처럼 절대 경로를 쓰고,
// Vite 가 주입하는 `/@vite/client` 도 절대 경로다. 그래서 `/preview/*` 만
// 가로채면 iframe 안의 하위 요청들이 전부 origin 루트로 새서 404 가 난다.
// `event.clientId` 로 "이 요청이 프리뷰 iframe 에서 왔는가" 를 보면 정확히 잡힌다.
const PREFIX = '/preview'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(route(event, url))
})

async function route(event, url) {
  const fromPreviewPath = url.pathname === PREFIX || url.pathname.startsWith(PREFIX + '/')

  // 하위 요청(`/src/main.tsx`, `/@vite/client`, `/node_modules/.vite/deps/*`)은
  // 접두사가 없다. 요청을 낸 클라이언트가 프리뷰 iframe 인지로 판별한다.
  let fromPreviewClient = false
  if (!fromPreviewPath && event.clientId) {
    const client = await self.clients.get(event.clientId)
    if (client) fromPreviewClient = new URL(client.url).pathname.startsWith(PREFIX)
  }

  if (!fromPreviewPath && !fromPreviewClient) return fetch(event.request)

  // Vite 는 /preview 접두사를 모른다 — 벗겨서 넘긴다
  const vitePath = fromPreviewPath ? url.pathname.slice(PREFIX.length) || '/' : url.pathname

  return toVite(event, vitePath + url.search)
}

async function toVite(event, vitePath) {
  // 브리지 페이지(=Vite 워커를 들고 있는 최상위 페이지)를 찾는다
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const page = all.find((c) => !new URL(c.url).pathname.startsWith(PREFIX)) ?? all[0]
  if (!page) return new Response('브리지 페이지를 찾을 수 없음', { status: 503 })

  const res = await new Promise((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = (e) => resolve(e.data)
    page.postMessage(
      {
        type: 'vite-request',
        request: {
          id: Math.random().toString(36).slice(2),
          method: event.request.method,
          url: vitePath,
          headers: Object.fromEntries(event.request.headers),
        },
      },
      [ch.port2],
    )
    setTimeout(
      () => resolve({ status: 504, headers: {}, body: '워커 응답 없음 (타임아웃)' }),
      30000,
    )
  })

  return new Response(res.body, {
    status: res.status,
    headers: {
      ...res.headers,
      // 부모가 cross-origin isolated 이므로 iframe 의 리소스도 같은 정책이어야 한다
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}
