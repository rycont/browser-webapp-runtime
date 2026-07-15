/**
 * 검증용 Todo 앱 — **평범한 Vite + React + Tailwind + TypeScript 프로젝트.**
 * 브라우저에서 돌리려고 특별히 손댄 곳이 한 군데도 없다는 게 요점이다.
 */
export const TODO_APP: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'todo-app',
      private: true,
      type: 'module',
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    },
    null,
    2,
  ),

  'index.html': `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>Todo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  'src/style.css': `@import "tailwindcss";
`,

  'src/main.tsx': `import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './style.css'

createRoot(document.getElementById('root')!).render(<App />)
`,

  'src/App.tsx': `import { useState } from 'react'

interface Todo {
  id: number
  text: string
  done: boolean
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: '브라우저에서 Vite 띄우기', done: true },
    { id: 2, text: 'Tailwind CSS 생성하기', done: true },
    { id: 3, text: 'iframe 에 서빙하기', done: false },
  ])
  const [draft, setDraft] = useState<string>('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    setTodos((t) => [...t, { id: Date.now(), text, done: false }])
    setDraft('')
  }

  const toggle = (id: number) =>
    setTodos((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)))

  const remaining = todos.filter((t) => !t.done).length

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Todo</h1>
        <p className="mb-4 text-sm text-slate-500" data-testid="remaining">
          {remaining}개 남음
        </p>

        <div className="mb-4 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="할 일 추가"
            data-testid="input"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
          <button
            onClick={add}
            data-testid="add"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 active:bg-sky-700"
          >
            추가
          </button>
        </div>

        <ul className="divide-y divide-slate-200" data-testid="list">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
                className="size-4 rounded border-slate-300 accent-sky-500"
              />
              <span
                className={
                  t.done
                    ? 'flex-1 text-sm text-slate-400 line-through'
                    : 'flex-1 text-sm text-slate-800'
                }
              >
                {t.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
`,
}
