/**
 * 소스에서 Tailwind 후보(candidate)를 뽑는다 — **순수 JS, wasm 없음.**
 *
 * ## 왜 `@tailwindcss/oxide` 를 안 쓰나
 *
 * oxide 의 `Scanner.scan()` 은 브라우저에서 구조적으로 불가능하고
 * (`src/tailwind.ts` 주석 참고), `scanFiles()` 는 되지만 oxide wasm 을 로드하는
 * 순간 rolldown 과 충돌해서 멈춘다. oxide 를 아예 안 쓰면 둘 다 사라진다:
 *
 *   - 지금의 블로커 (rolldown + oxide 공존 시 멈춤)
 *   - Tailwind 쪽 SharedArrayBuffer 요구 (rolldown 것만 남는다)
 *   - wasm 1.7 MB 다운로드
 *
 * ## 왜 정규식으로 충분한가
 *
 * `compile().build(candidates)` 는 **모르는 후보를 조용히 무시한다.**
 * 즉 **과추출은 안전하고 누락만 위험하다.** 그래서 게걸스럽게 긁으면 된다.
 *
 * 실측 (App.tsx 하나, oxide 대비):
 *
 * ```
 * oxide 후보: 29개 → CSS 9,962 바이트
 * JS   후보: 41개 → CSS 9,962 바이트     ← 과추출했는데 결과 동일
 * 두 CSS 가 동일한가? ✅ 완전히 같음 (바이트 단위)
 * ```
 *
 * ## 두 패스인 이유
 *
 * 처음엔 따옴표·`=`·꺾쇠를 문자 클래스에 넣었다가 `className="flex` 를 **한
 * 토큰으로** 삼켜서 `.flex` 를 통째로 놓쳤다. 따옴표는 **구분자**여야 한다.
 * 하지만 arbitrary value 안에는 따옴표가 들어갈 수 있어서
 * (`content-['hi']`, `[&_[data-x='y']]:block`) 대괄호 패스를 따로 돌려 union 한다.
 */

/** 패스 1: 따옴표/공백/꺾쇠/`=` 로 잘린 평범한 토큰. */
const PLAIN = /[A-Za-z0-9_:\/\[\]\-\.%\(\)&@#\$\*\+\!\?,]+/g

/** 패스 2: 대괄호 arbitrary value — 안에 따옴표가 있어도 통째로 집는다. */
const BRACKETED = /[A-Za-z0-9_:\/\-\.]*\[[^\]]*\][A-Za-z0-9_:\/\-\.]*/g

/**
 * 소스 문자열에서 Tailwind 후보를 뽑는다. 과추출을 의도한다 — 정확도가 아니라
 * **누락 없음**이 목표다.
 */
export function extractCandidates(source: string): string[] {
  const out = new Set<string>()
  for (const t of source.match(PLAIN) ?? []) out.add(t)
  for (const t of source.match(BRACKETED) ?? []) out.add(t)
  return [...out]
}

/** 여러 파일에서 뽑아 합친다. */
export function extractCandidatesFrom(sources: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const src of sources) {
    for (const t of src.match(PLAIN) ?? []) out.add(t)
    for (const t of src.match(BRACKETED) ?? []) out.add(t)
  }
  return [...out]
}
