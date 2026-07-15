// COOP/COEP 가 걸린 실제 브라우저 워커 안에서 툴체인을 검증한다.
// 결과는 매 단계 postMessage 로 흘려보낸다 — 하드 블록이면 setTimeout 조차 안 도므로
// **마지막 성공 지점이 곧 멈춘 지점**이다.
import '../../src/shims/globals.ts'
import { checkRuntimeSupport } from '../../src/mod.ts'
import { seedPackages, seedProject, seedViteInstall } from '../../src/seed.ts'
import { tailwindBrowser } from '../../src/tailwind.ts'
import { TODO_APP } from './todo-app.ts'
import vitePkg from 'vite/package.json'
import clientMjs from 'vite/dist/client/client.mjs?raw'
import envMjs from 'vite/dist/client/env.mjs?raw'
// 앱 트리 — 빌드 타임에 인라인해둔 react/react-dom/tailwindcss 등
import inlinedPackages from 'virtual:inlined-packages'

// Vite 를 import 하기 **전에** memfs 를 채워야 한다.
// vite/dist/node/chunks/node.js 의 src/node/constants.ts 영역이 모듈 최상단에서
// readFileSync 로 자기 package.json 을 읽기 때문이다.
seedViteInstall({ packageJson: vitePkg as { version: string }, clientMjs, envMjs })
seedProject('/app', TODO_APP)
seedPackages('/app', inlinedPackages as Record<string, Record<string, string>>)

interface Result {
  name: string
  ok: boolean
  detail: string
}

const results: Result[] = []

const t = async (name: string, fn: () => unknown): Promise<void> => {
  try {
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('40초 타임아웃 — 여기서 멈춤')), 40_000),
    )
    results.push({
      name,
      ok: true,
      detail: String(await Promise.race([fn(), timeout])).slice(0, 150),
    })
  } catch (e) {
    const err = e as Error
    results.push({
      name,
      ok: false,
      detail: String(err?.stack || err?.message || e).replace(/\s+/g, ' ').slice(0, 240),
    })
  }
  ;(self as unknown as Worker).postMessage([...results])
}

await t('런타임 지원 (COOP/COEP, SAB, 중첩 Worker, shared wasm memory)', () => {
  const s = checkRuntimeSupport()
  if (!s.ok) throw new Error(JSON.stringify(s))
  return JSON.stringify(s)
})

await t('memfs: Todo 앱 + 앱 트리(react 등) 시딩', async () => {
  const { fs } = await import('memfs')
  const f = fs as unknown as { existsSync(p: string): boolean; readdirSync(p: string): string[] }
  const mods = f.readdirSync('/app/node_modules')
  if (!f.existsSync('/app/src/App.tsx')) throw new Error('App.tsx 없음')
  if (!f.existsSync('/app/node_modules/react/index.js')) throw new Error('react 없음')
  return `node_modules=${JSON.stringify(mods)} | App.tsx ✓ react ✓`
})

let server: Awaited<ReturnType<typeof import('vite').createServer>> | undefined

await t('vite: createServer (react + tailwind 플러그인)', async () => {
  const { createServer } = await import('vite')
  const react = (await import('@vitejs/plugin-react')).default
  // ⚠️ 서버는 워커당 하나만. 두 개면 rolldown wasm 인스턴스가 둘이 된다.
  server = await createServer({
    configFile: false,
    logLevel: 'silent',
    root: '/app',
    plugins: [react(), tailwindBrowser({ root: '/app' })],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  return 'server OK: ' + Object.keys(server).slice(0, 8).join(',')
})

await t('vite: App.tsx 변환 (TS + JSX)', async () => {
  if (!server) throw new Error('server 없음')
  const r = await server.transformRequest('/src/App.tsx')
  if (!r) throw new Error('null')
  const hasJsx = /jsx|createElement/i.test(r.code)
  const noTs = !r.code.includes('interface Todo')
  return `${r.code.length}바이트 | JSX변환=${hasJsx} 타입제거=${noTs}`
})

await t('vite: main.tsx 변환 (react-dom import 해석)', async () => {
  if (!server) throw new Error('server 없음')
  const r = await server.transformRequest('/src/main.tsx')
  if (!r) throw new Error('null')
  return r.code.replace(/\s+/g, ' ').slice(0, 140)
})

await t('tailwind: Todo 앱의 클래스로 CSS 생성', async () => {
  if (!server) throw new Error('server 없음')
  const r = await server.transformRequest('/src/style.css')
  if (!r) throw new Error('null')
  const want = ['min-h-screen', 'bg-slate-100', 'rounded-2xl', 'bg-sky-500', 'line-through', 'divide-y']
  const found = want.filter((c) => r.code.includes(`.${c}`))
  if (found.length !== want.length) {
    throw new Error(`누락: ${want.filter((c) => !found.includes(c)).join(',')}`)
  }
  return `${r.code.length}바이트 | ${found.join(',')}`
})

;(self as unknown as Worker).postMessage(results)
