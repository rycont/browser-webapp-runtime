/**
 * 워커 전역 부트스트랩.
 *
 * Vite 를 import 하기 **전에** 이 모듈을 import 해야 한다. Vite 의 dist 는
 * 모듈 최상단에서 `process` 와 `Buffer` 를 건드리기 때문이다.
 *
 * `global` 은 여기서 안 다룬다 — Vite 설정의 `define: { global: 'globalThis' }` 로
 * 컴파일 타임에 치환하는 게 맞다 (nodeShimDefine() 참고).
 */
import { Buffer } from './buffer.ts'
import { installProcessShim } from './process.ts'

/**
 * Node 의 `setTimeout()` 은 `.unref()` / `.ref()` 가 달린 Timeout **객체**를 주는데
 * 브라우저는 그냥 숫자를 준다. Vite 의 dep optimizer 가 이걸 쓴다:
 *
 *     TypeError: setTimeout(...).unref is not a function
 *       at loadCachedDepOptimizationMetadata
 *
 * 그래서 Number 래퍼 객체를 돌려주고 unref/ref 를 달아준다. `clearTimeout(obj)` 는
 * ToNumber 로 강제 변환되므로 그대로 동작한다.
 */
function installTimerShim(): void {
  const g = globalThis as unknown as {
    setTimeout: typeof setTimeout
    setInterval: typeof setInterval
    __timerShimInstalled?: boolean
  }
  if (g.__timerShimInstalled) return
  g.__timerShimInstalled = true

  const wrap = (orig: (...a: never[]) => number) =>
    (...args: never[]): number => {
      const id = orig(...args)
      // Number 객체 — clearTimeout 은 ToNumber 로 강제되므로 그대로 먹는다
      const handle = new Number(id) as Number & {
        unref(): unknown
        ref(): unknown
        hasRef(): boolean
      }
      handle.unref = () => handle
      handle.ref = () => handle
      handle.hasRef = () => true
      return handle as unknown as number
    }

  const st = g.setTimeout.bind(globalThis) as unknown as (...a: never[]) => number
  const si = g.setInterval.bind(globalThis) as unknown as (...a: never[]) => number
  g.setTimeout = wrap(st) as unknown as typeof setTimeout
  g.setInterval = wrap(si) as unknown as typeof setInterval
}

/** `globalThis.process` / `Buffer` / Timeout 객체 셤을 설치한다. 이미 있으면 두고 간다. */
export function installGlobals(env: Record<string, string | undefined> = {}): void {
  installProcessShim(env)
  const g = globalThis as unknown as { Buffer?: unknown; global?: unknown }
  g.Buffer ??= Buffer
  g.global ??= globalThis
  installTimerShim()
}

installGlobals()
