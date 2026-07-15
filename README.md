# web-toolchain-in-browser

[![JSR](https://jsr.io/badges/@rycont/web-toolchain-in-browser)](https://jsr.io/@rycont/web-toolchain-in-browser)

Vite 8 + React + Tailwind v4 + TypeScript 앱을 브라우저 안에서 빌드하고 돌린다. 서버 없음.

## 요구사항

HTTPS(또는 localhost) + 아래 헤더. 없으면 안 돈다.

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Service-Worker-Allowed: /
```

메모리 약 425 MB. 데스크톱 Chrome/Edge 검증됨, iOS Safari 는 안 될 가능성이 높다
([이유](https://github.com/rycont/web-toolchain-in-browser/blob/main/NOTES.md#메모리--node-에선-공짜지만-브라우저에선-아니다)).

## 설치

```bash
npx jsr add @rycont/web-toolchain-in-browser

npm i -D vite@8 @rolldown/browser lightningcss-wasm tailwindcss@4 \
         memfs path-browserify events stream-browserify buffer util picomatch postcss
```

## 사용

```ts
// worker.ts
import '@rycont/web-toolchain-in-browser/shims/globals' // Vite import 보다 먼저
import { createBrowserRuntime, serveWorker } from '@rycont/web-toolchain-in-browser/runtime'
import inlinedPackages from 'virtual:inlined-packages'
import vitePkg from 'vite/package.json'
import clientMjs from 'vite/dist/client/client.mjs?raw'
import envMjs from 'vite/dist/client/env.mjs?raw'

// serveWorker 앞에 await 가 있으면 안 된다
const ready = (async () => {
  const react = (await import('@vitejs/plugin-react')).default
  return createBrowserRuntime({
    files: { 'index.html': '…', 'src/main.tsx': '…', 'src/style.css': '@import "tailwindcss";' },
    packages: inlinedPackages,
    vite: { packageJson: vitePkg, clientMjs, envMjs },
    plugins: [react()],
  })
})()
serveWorker(ready)

const runtime = await ready
runtime.writeFile('src/App.tsx', code)
```

```ts
// page.ts
import { createPreview, explainUnsupported } from '@rycont/web-toolchain-in-browser/preview'

const why = explainUnsupported()
if (why) throw new Error(why)

const preview = await createPreview({
  worker: new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  swUrl: '/sw.js',
  iframe: document.querySelector('iframe'),
})
await preview.load()
await preview.reload()
```

```js
// sw.js
import '@rycont/web-toolchain-in-browser/sw'
```

```ts
// vite.config.ts
import { nodeShimAlias, nodeShimDefine } from '@rycont/web-toolchain-in-browser/alias'
import { inlinePackages } from '@rycont/web-toolchain-in-browser/inline-packages-plugin'

const APP_TREE = ['react', 'react-dom', 'scheduler', 'tailwindcss']
const inline = () => inlinePackages(APP_TREE, import.meta.url)

export default {
  plugins: [inline()],
  worker: { format: 'es', plugins: () => [inline()] }, // 워커는 파이프라인이 별도다
  resolve: { alias: nodeShimAlias(), conditions: ['browser', 'import', 'default'] },
  define: nodeShimDefine(),
  build: {
    target: 'esnext',
    rolldownOptions: {
      input: { index: 'index.html', sw: 'sw.js' },
      output: { entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
}
```

동작하는 전체 예제: [`test/browser/`](https://github.com/rycont/web-toolchain-in-browser/tree/main/test/browser)

## 개발

```bash
npm install
npm run test:browser   # 실제 Chrome 에서 검증 + 스크린샷
npm run serve:lan      # LAN 에 HTTPS 로 (실기기 확인용)
```

실측치와 함정: [NOTES.md](https://github.com/rycont/web-toolchain-in-browser/blob/main/NOTES.md)

## 라이선스

MIT
