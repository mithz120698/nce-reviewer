import { useEffect, useMemo, useState } from 'react'
import data from './data/questions.json'
import explanations from './data/explanations.json'
import './App.css'

const TESTS = data.tests
const LETTERS = ['A', 'B', 'C', 'D', 'E']
const STORE_KEY = 'nce-reviewer-v1'

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {}
  } catch {
    return {}
  }
}
function saveStore(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable */
  }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Render ^sup, _sub and __underline__ markup from the transcription.
function Rich({ text }) {
  if (!text) return null
  const parts = []
  const re = /__(.+?)__|\^(\{[^}]*\}|[\w.\-+]+)|_(\{[^}]*\}|\w+)/g
  let last = 0
  let m
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1]) parts.push(<u key={k++}>{m[1]}</u>)
    else if (m[2]) parts.push(<sup key={k++}>{m[2].replace(/[{}]/g, '')}</sup>)
    else if (m[3]) parts.push(<sub key={k++}>{m[3].replace(/[{}]/g, '')}</sub>)
    last = re.lastIndex
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('nce-theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])
  const dark = theme === 'dark'
  return (
    <button className="theme-toggle" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

export default function App() {
  return (
    <>
      <ThemeToggle />
      <Main />
    </>
  )
}

function Main() {
  const [store, setStore] = useState(loadStore)
  const [session, setSession] = useState(null)

  useEffect(() => saveStore(store), [store])

  const start = (testIds, mode, opts = {}) => {
    let qs = TESTS.filter((t) => testIds.includes(t.id)).flatMap((t) => t.questions)
    if (opts.onlyMissed) qs = qs.filter((q) => store.missed?.[q.id])
    if (opts.shuffle) qs = shuffle(qs)
    if (!qs.length) return
    setSession({ qs, mode, idx: 0, answers: {}, revealed: {}, startedAt: Date.now(), done: false, label: opts.label, limit: opts.limit || null })
  }

  const finish = (sess) => {
    const missed = { ...(store.missed || {}) }
    let correct = 0
    sess.qs.forEach((q) => {
      if (sess.answers[q.id] === q.answer) {
        correct++
        delete missed[q.id]
      } else missed[q.id] = true
    })
    const history = [
      { label: sess.label, mode: sess.mode, correct, total: sess.qs.length, secs: Math.round((Date.now() - sess.startedAt) / 1000), at: Date.now() },
      ...(store.history || []),
    ].slice(0, 20)
    setStore({ ...store, missed, history })
    setSession({ ...sess, done: true, correct, endedAt: Date.now() })
  }

  if (session?.done) return <Results session={session} onHome={() => setSession(null)} onReview={() => setSession({ ...session, done: false, reviewing: true, idx: 0 })} />
  if (session) return <Quiz session={session} setSession={setSession} onFinish={finish} onQuit={() => setSession(null)} />
  return <Home store={store} start={start} onReset={() => setStore({})} />
}

function Home({ store, start, onReset }) {
  const [mode, setMode] = useState('practice')
  const [doShuffle, setDoShuffle] = useState(false)
  const [minutes, setMinutes] = useState('')
  const limit = Number(minutes) > 0 ? Math.round(Number(minutes) * 60) : null
  const missedCount = Object.keys(store.missed || {}).length
  const total = TESTS.reduce((n, t) => n + t.questions.length, 0)

  return (
    <div className="wrap">
      <header className="hero">
        <p className="eyebrow">PSHS System</p>
        <h1>NCE Reviewer</h1>
        <p className="sub">{total} practice questions across {TESTS.length} tests. Pick a test, answer, and check yourself.</p>
      </header>

      <section className="controls">
        <div className="seg" role="radiogroup" aria-label="Mode">
          <button className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>
            Practice <span>instant feedback</span>
          </button>
          <button className={mode === 'exam' ? 'on' : ''} onClick={() => setMode('exam')}>
            Exam <span>score at the end</span>
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={doShuffle} onChange={(e) => setDoShuffle(e.target.checked)} /> Shuffle questions
        </label>
      </section>

      <section className="timer-pick">
        <span className="label">Countdown</span>
        {[['', 'Off'], ['15', '15m'], ['30', '30m'], ['60', '1h']].map(([v, l]) => (
          <button key={l} className={minutes === v ? 'chip on' : 'chip'} onClick={() => setMinutes(v)}>{l}</button>
        ))}
        <label className="custom">
          <input type="number" min="1" max="600" placeholder="Custom" value={minutes} onChange={(e) => setMinutes(e.target.value)} /> min
        </label>
      </section>

      <section className="grid">
        {TESTS.map((t, i) => (
          <button key={t.id} className="card" onClick={() => start([t.id], mode, { shuffle: doShuffle, label: t.name, limit })}>
            <span className="num">Test {['I', 'II', 'III', 'IV'][i]}</span>
            <strong>{t.name}</strong>
            <span className="meta">{t.questions.length} questions</span>
          </button>
        ))}
        <button className="card wide" onClick={() => start(TESTS.map((t) => t.id), mode, { shuffle: doShuffle, label: 'Full mock exam', limit })}>
          <span className="num">All tests</span>
          <strong>Full mock exam</strong>
          <span className="meta">{total} questions</span>
        </button>
        <button
          className="card wide alt"
          disabled={!missedCount}
          onClick={() => start(TESTS.map((t) => t.id), mode, { onlyMissed: true, shuffle: doShuffle, label: 'Missed questions', limit })}
        >
          <span className="num">Redo</span>
          <strong>Missed questions</strong>
          <span className="meta">{missedCount ? `${missedCount} to retry` : 'Nothing missed yet'}</span>
        </button>
      </section>

      {store.history?.length > 0 && (
        <section className="history">
          <div className="history-head">
            <h2>Recent attempts</h2>
            <button className="link" onClick={onReset}>Clear progress</button>
          </div>
          <ul>
            {store.history.map((h, i) => (
              <li key={i}>
                <span>{h.label}</span>
                <span className="muted">{h.mode} · {fmtTime(h.secs)}</span>
                <strong>{h.correct}/{h.total}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="foot">
        Content from the PSHS System NCE Reviewer (2024), a free publication of the PSHS Admissions Office. Used with permission.
      </footer>
    </div>
  )
}

function Quiz({ session, setSession, onFinish, onQuit }) {
  const { qs, idx, answers, revealed, mode, reviewing } = session
  const q = qs[idx]
  const [now, setNow] = useState(Date.now())
  const [showPage, setShowPage] = useState(false)

  useEffect(() => {
    if (reviewing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [reviewing])
  useEffect(() => setShowPage(false), [idx])

  const elapsed = Math.round((now - session.startedAt) / 1000)
  const remaining = session.limit ? Math.max(0, session.limit - elapsed) : null
  useEffect(() => {
    if (!reviewing && remaining === 0) onFinish({ ...session, timedOut: true })
  }, [remaining, reviewing]) // eslint-disable-line react-hooks/exhaustive-deps

  const picked = answers[q.id]
  const isRevealed = reviewing || (mode === 'practice' && revealed[q.id])
  const answeredCount = Object.keys(answers).length

  const pick = (l) => {
    if (isRevealed) return
    const next = { ...session, answers: { ...answers, [q.id]: l } }
    if (mode === 'practice') next.revealed = { ...revealed, [q.id]: true }
    setSession(next)
  }
  const go = (i) => setSession({ ...session, idx: Math.max(0, Math.min(qs.length - 1, i)) })

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      const k = e.key.toUpperCase()
      if (LETTERS.includes(k)) pick(k)
      else if (e.key === 'ArrowRight') go(idx + 1)
      else if (e.key === 'ArrowLeft') go(idx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const choiceClass = (l) => {
    if (!isRevealed) return picked === l ? 'choice picked' : 'choice'
    if (l === q.answer) return 'choice right'
    if (l === picked) return 'choice wrong'
    return 'choice dim'
  }

  return (
    <div className="wrap quiz">
      <div className="topbar">
        <button className="link" onClick={onQuit}>← Home</button>
        <span className="muted">{session.label}</span>
        {!reviewing && (
          <span className={remaining !== null && remaining <= 60 ? 'timer low' : 'timer'} title={remaining !== null ? 'Time left' : 'Time elapsed'}>
            {remaining !== null ? `⏳ ${fmtTime(remaining)}` : fmtTime(elapsed)}
          </span>
        )}
      </div>

      <div className="progress"><div style={{ width: `${((idx + 1) / qs.length) * 100}%` }} /></div>

      <article className="qcard">
        <div className="qhead">
          <span className="tag">{q.testName}</span>
          <span className="muted">Q{q.number} · {idx + 1} of {qs.length}</span>
        </div>

        {q.instruction && <p className="instruction"><Rich text={q.instruction} /></p>}
        {q.text && <p className="stem"><Rich text={q.text} /></p>}

        {q.figures?.length > 0 && (
          <div className="figs">
            {q.figures.map((f) => (
              <img key={f} src={`${import.meta.env.BASE_URL}figs/${f}`} alt={`Figure for question ${q.number}`} />
            ))}
          </div>
        )}

        <div className={q.choices ? 'choices' : 'choices letters'}>
          {LETTERS.filter((l) => !q.choices || q.choices[l] !== undefined).map((l) => (
            <button key={l} className={choiceClass(l)} onClick={() => pick(l)}>
              <span className="letter">{l}</span>
              {q.choices && <span><Rich text={q.choices[l]} /></span>}
            </button>
          ))}
        </div>

        {isRevealed && (
          <p className={picked === q.answer ? 'verdict ok' : 'verdict no'}>
            {picked === q.answer ? 'Correct!' : picked ? `Not quite. Answer: ${q.answer}` : `Skipped. Answer: ${q.answer}`}
          </p>
        )}
        {isRevealed && explanations[q.id] && (
          <div className="explain">
            <strong>Why {q.answer}?</strong>
            <p><Rich text={explanations[q.id]} /></p>
          </div>
        )}

        <button className="link small" onClick={() => setShowPage((s) => !s)}>
          {showPage ? 'Hide' : 'Show'} original page
        </button>
        {showPage && <img className="page" src={`${import.meta.env.BASE_URL}pages/${q.page}`} alt="Original reviewer page" />}
      </article>

      <div className="nav">
        <button onClick={() => go(idx - 1)} disabled={idx === 0}>Previous</button>
        {idx < qs.length - 1 ? (
          <button className="primary" onClick={() => go(idx + 1)}>Next</button>
        ) : reviewing ? (
          <button className="primary" onClick={onQuit}>Done</button>
        ) : (
          <button className="primary" onClick={() => onFinish(session)}>
            Finish{mode === 'exam' && answeredCount < qs.length ? ` (${qs.length - answeredCount} blank)` : ''}
          </button>
        )}
      </div>

      <div className="dots">
        {qs.map((x, i) => {
          let c = 'dot'
          if (i === idx) c += ' cur'
          if (answers[x.id]) {
            if (reviewing || (mode === 'practice' && revealed[x.id])) c += answers[x.id] === x.answer ? ' ok' : ' no'
            else c += ' done'
          }
          return (
            <button key={x.id} className={c} onClick={() => go(i)} aria-label={`Question ${i + 1}`}>
              {i + 1}
            </button>
          )
        })}
      </div>
      <p className="hint muted">Tip: press A–E to answer, ← → to move.</p>
    </div>
  )
}

function Results({ session, onHome, onReview }) {
  const { qs, answers, correct } = session
  const pct = Math.round((correct / qs.length) * 100)
  const byTest = useMemo(() => {
    const m = {}
    qs.forEach((q) => {
      m[q.testName] ??= { c: 0, t: 0 }
      m[q.testName].t++
      if (answers[q.id] === q.answer) m[q.testName].c++
    })
    return Object.entries(m)
  }, [qs, answers])

  return (
    <div className="wrap">
      <div className="result">
        <p className="eyebrow">{session.label}</p>
        <div className="score">{correct}<span>/{qs.length}</span></div>
        {session.timedOut && <p className="timeup">Time's up! Unanswered questions count as wrong.</p>}
        <p className="sub">{pct}% · {fmtTime(Math.round((session.endedAt - session.startedAt) / 1000))}</p>
        <div className="bars">
          {byTest.map(([name, v]) => (
            <div key={name} className="bar">
              <span>{name}</span>
              <div className="track"><div style={{ width: `${(v.c / v.t) * 100}%` }} /></div>
              <strong>{v.c}/{v.t}</strong>
            </div>
          ))}
        </div>
        <div className="nav">
          <button onClick={onHome}>Home</button>
          <button className="primary" onClick={onReview}>Review answers</button>
        </div>
      </div>
    </div>
  )
}
