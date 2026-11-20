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

const HELP = [
  ['Modes', [
    ['Practice', 'See if you got it right, plus an explanation, right after each answer.'],
    ['Exam', 'Answer everything first and get your score at the end, like the real test.'],
    ['Study', 'Browse questions with the answers and explanations already shown. Good for a first read-through.'],
  ]],
  ['Options', [
    ['Countdown', 'Pick a time limit before starting. When time runs out, the test submits itself and blank answers count as wrong.'],
    ['Shuffle', 'Mixes up the question order so you remember concepts, not positions.'],
    ['Search', 'Type a word or topic (e.g. "volume", "idiom") or a test and number (e.g. "abstract q5") to find questions fast.'],
  ]],
  ['Tracking', [
    ['Mastered', 'A question is mastered when your latest answer to it was right. Get it wrong later and it goes back to review.'],
    ['Missed questions', 'Collects everything you got wrong so you can retry just those.'],
    ['Bookmarks', 'Tap ☆ (or press S) on any question to save it for later.'],
    ['Focus next', 'Points you to the test where you have the fewest mastered questions.'],
    ['Backup', 'Progress lives in this browser. Use "Download backup" to move it to another phone or computer.'],
  ]],
  ['Keyboard', [
    ['A–E', 'Choose an answer'],
    ['← →', 'Previous / next question'],
    ['S', 'Bookmark the current question'],
  ]],
  ['Offline', [
    ['No internet?', 'After your first visit, the reviewer works offline. On a phone, use "Add to Home Screen" to install it like an app.'],
  ]],
]

function Help({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="help-title">How to use the reviewer</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close help">✕</button>
        </div>
        {HELP.map(([section, rows]) => (
          <div key={section} className="help-sec">
            <h3>{section}</h3>
            <dl>
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className="muted help-foot">
          Test-taking tips from the reviewer: make a study plan, start with the easy parts, read carefully, and stay calm. Good luck!
        </p>
      </div>
    </div>
  )
}

function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="help-toggle" onClick={() => setOpen(true)} aria-label="Help" title="Help">?</button>
      {open && <Help onClose={() => setOpen(false)} />}
    </>
  )
}

export default function App() {
  return (
    <>
      <HelpButton />
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
    let qs = opts.qs || TESTS.filter((t) => testIds.includes(t.id)).flatMap((t) => t.questions)
    if (opts.onlyMissed) qs = qs.filter((q) => store.missed?.[q.id])
    if (opts.onlyBookmarked) qs = qs.filter((q) => store.bookmarks?.[q.id])
    if (opts.shuffle) qs = shuffle(qs)
    if (!qs.length) return
    const study = mode === 'study'
    setSession({
      qs, mode, idx: opts.idx || 0, answers: {}, revealed: {}, startedAt: Date.now(), done: false,
      label: opts.label, limit: study ? null : opts.limit || null, reviewing: study,
    })
  }

  const toggleBookmark = (id) => {
    const bookmarks = { ...(store.bookmarks || {}) }
    if (bookmarks[id]) delete bookmarks[id]
    else bookmarks[id] = true
    setStore({ ...store, bookmarks })
  }

  // Per-question stats: { tries, right, last: true|false, at }
  const recordProgress = (sess, onlyAnswered) => {
    const progress = { ...(store.progress || {}) }
    sess.qs.forEach((q) => {
      const a = sess.answers[q.id]
      if (onlyAnswered && !a) return
      const p = progress[q.id] || { tries: 0, right: 0 }
      const ok = a === q.answer
      progress[q.id] = { tries: p.tries + 1, right: p.right + (ok ? 1 : 0), last: ok, at: Date.now() }
    })
    return progress
  }

  const quit = () => {
    // Keep progress from a practice session left midway.
    if (session && !session.reviewing && session.mode === 'practice' && Object.keys(session.answers).length) {
      const missed = { ...(store.missed || {}) }
      session.qs.forEach((q) => {
        const a = session.answers[q.id]
        if (!a) return
        if (a === q.answer) delete missed[q.id]
        else missed[q.id] = true
      })
      setStore({ ...store, missed, progress: recordProgress(session, true) })
    }
    setSession(null)
  }

  const finish = (sess) => {
    const missed = { ...(store.missed || {}) }
    let correct = 0
    // In practice mode, skipped questions don't count against you.
    const practice = sess.mode === 'practice'
    sess.qs.forEach((q) => {
      if (sess.answers[q.id] === q.answer) {
        correct++
        delete missed[q.id]
      } else if (!practice || sess.answers[q.id]) missed[q.id] = true
    })
    const progress = recordProgress(sess, practice)
    const history = [
      { label: sess.label, mode: sess.mode, correct, total: sess.qs.length, secs: Math.round((Date.now() - sess.startedAt) / 1000), at: Date.now() },
      ...(store.history || []),
    ].slice(0, 20)
    setStore({ ...store, missed, history, progress })
    setSession({ ...sess, done: true, correct, endedAt: Date.now() })
  }

  if (session?.done) return <Results session={session} onHome={() => setSession(null)} onReview={() => setSession({ ...session, done: false, reviewing: true, idx: 0 })} />
  if (session)
    return <Quiz session={session} setSession={setSession} onFinish={finish} onQuit={quit} bookmarks={store.bookmarks || {}} onBookmark={toggleBookmark} />
  return <Home store={store} start={start} setStore={setStore} />
}

const TEST_ROMAN = ['I', 'II', 'III', 'IV']
const strip = (s) => (s || '').replace(/__|\^|[{}]/g, '').toLowerCase()
const SEARCH_INDEX = TESTS.flatMap((t, ti) =>
  t.questions.map((q) => ({
    q,
    hay: strip(
      [`test ${TEST_ROMAN[ti]}`, t.name, `q${q.number}`, `#${q.number}`, q.instruction, q.text, ...Object.values(q.choices || {}), explanations[q.id]].join(' \n '),
    ),
  })),
)

function snippet(q) {
  const s = strip(q.text || q.instruction || '').replace(/\s+/g, ' ')
  if (!s) return 'Picture question'
  return s.length > 110 ? s.slice(0, 110) + '…' : s
}

function Search({ onOpen }) {
  const [query, setQuery] = useState('')
  const terms = strip(query).split(/\s+/).filter(Boolean)
  const matches = (e, w) => {
    const num = w.match(/^(?:q|#)(\d+)$/)
    return num ? e.q.number === Number(num[1]) : e.hay.includes(w)
  }
  const results = terms.length ? SEARCH_INDEX.filter((e) => terms.every((w) => matches(e, w))).map((e) => e.q) : []

  return (
    <section className="search">
      <div className="search-box">
        <span aria-hidden="true">🔍</span>
        <input
          type="search"
          placeholder="Search questions, choices, or topics (e.g. volume, idiom, abstract q5)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search questions"
        />
      </div>
      {terms.length > 0 && (
        <div className="search-results">
          <div className="search-meta muted">
            {results.length ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'No matches'}
            {results.length > 1 && (
              <button className="link" onClick={() => onOpen(results, 0)}>Practice all {results.length} →</button>
            )}
          </div>
          <ul>
            {results.slice(0, 25).map((q, i) => (
              <li key={q.id}>
                <button onClick={() => onOpen(results, i)}>
                  <span className="tag">{q.testName} · Q{q.number}</span>
                  <span>{snippet(q)}</span>
                </button>
              </li>
            ))}
          </ul>
          {results.length > 25 && <p className="muted small-note">Showing first 25. Refine your search to see more.</p>}
        </div>
      )}
    </section>
  )
}

function statusOf(p) {
  if (!p) return 'new'
  return p.last ? 'mastered' : 'review'
}

function Progress({ progress, onOpen }) {
  const [open, setOpen] = useState(false)
  const all = TESTS.flatMap((t) => t.questions)
  const tried = all.filter((q) => progress[q.id])
  const mastered = tried.filter((q) => progress[q.id].last).length
  const tries = tried.reduce((n, q) => n + progress[q.id].tries, 0)
  const rights = tried.reduce((n, q) => n + progress[q.id].right, 0)
  const pct = Math.round((mastered / all.length) * 100)

  return (
    <section className="tracker">
      <div className="tracker-head">
        <div className="ring" style={{ '--p': pct }} aria-label={`${pct}% mastered`}>
          <span>{pct}%</span>
        </div>
        <div className="tracker-stats">
          <h2>Your progress</h2>
          <div className="stats">
            <div><strong>{tried.length}</strong><span>of {all.length} tried</span></div>
            <div><strong>{mastered}</strong><span>mastered</span></div>
            <div><strong>{tried.length - mastered}</strong><span>to review</span></div>
            <div><strong>{tries ? Math.round((rights / tries) * 100) : 0}%</strong><span>accuracy</span></div>
          </div>
        </div>
      </div>

      <div className="test-bars">
        {TESTS.map((t) => {
          const n = t.questions.length
          const m = t.questions.filter((q) => statusOf(progress[q.id]) === 'mastered').length
          const r = t.questions.filter((q) => statusOf(progress[q.id]) === 'review').length
          return (
            <div key={t.id} className="test-bar">
              <span>{t.name}</span>
              <div className="stack" title={`${m} mastered, ${r} to review, ${n - m - r} not tried`}>
                <div className="m" style={{ width: `${(m / n) * 100}%` }} />
                <div className="r" style={{ width: `${(r / n) * 100}%` }} />
              </div>
              <strong>{m}/{n}</strong>
            </div>
          )
        })}
      </div>

      <div className="legend muted">
        <span><i className="m" /> Mastered (last answer right)</span>
        <span><i className="r" /> To review</span>
        <span><i /> Not tried</span>
        <button className="link" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'} question map</button>
      </div>

      {open && (
        <div className="qmap">
          {TESTS.map((t) => (
            <div key={t.id}>
              <p className="qmap-title">{t.name}</p>
              <div className="qmap-grid">
                {t.questions.map((q, i) => {
                  const p = progress[q.id]
                  return (
                    <button
                      key={q.id}
                      className={`cell ${statusOf(p)}`}
                      onClick={() => onOpen(t.questions, i, t.name)}
                      title={p ? `Q${q.number}: ${p.right}/${p.tries} correct` : `Q${q.number}: not tried`}
                    >
                      {q.number}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Backup({ store, setStore }) {
  const [msg, setMsg] = useState('')
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'nce-reviewer', version: 1, savedAt: new Date().toISOString(), data: store }, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nce-reviewer-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('Backup downloaded.')
  }
  const importData = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const data = parsed?.app === 'nce-reviewer' ? parsed.data : null
      if (!data || typeof data !== 'object') throw new Error('bad file')
      const clean = {
        progress: typeof data.progress === 'object' ? data.progress : {},
        missed: typeof data.missed === 'object' ? data.missed : {},
        bookmarks: typeof data.bookmarks === 'object' ? data.bookmarks : {},
        history: Array.isArray(data.history) ? data.history.slice(0, 20) : [],
      }
      if (!window.confirm('Replace your current progress with this backup?')) return
      setStore(clean)
      setMsg('Progress restored.')
    } catch {
      setMsg("That file isn't an NCE Reviewer backup.")
    }
  }
  const reset = () => {
    if (window.confirm('Clear all progress, bookmarks, and history? This cannot be undone.')) {
      setStore({})
      setMsg('Progress cleared.')
    }
  }
  return (
    <section className="backup">
      <h2>Your data</h2>
      <p className="muted">Progress is saved in this browser only. Download a backup to move it to another device.</p>
      <div className="backup-actions">
        <button onClick={exportData}>⬇ Download backup</button>
        <label className="file-btn">
          ⬆ Restore backup
          <input type="file" accept="application/json,.json" onChange={importData} />
        </label>
        <button className="danger" onClick={reset}>Clear progress</button>
      </div>
      {msg && <p className="backup-msg" role="status">{msg}</p>}
    </section>
  )
}

function Focus({ progress, start }) {
  const tried = TESTS.some((t) => t.questions.some((q) => progress[q.id]))
  if (!tried) return null
  const scored = TESTS.map((t) => {
    const n = t.questions.length
    const m = t.questions.filter((q) => progress[q.id]?.last).length
    const r = t.questions.filter((q) => progress[q.id] && !progress[q.id].last)
    return { t, n, m, r, ratio: m / n }
  }).sort((a, b) => a.ratio - b.ratio)
  const w = scored[0]
  if (w.m === w.n) return <p className="focus done">🎉 You've mastered every question. Try a timed full mock exam!</p>
  return (
    <div className="focus">
      <div>
        <span className="eyebrow">Focus next</span>
        <strong>{w.t.name}</strong>
        <span className="muted"> · {w.m}/{w.n} mastered{w.r.length ? `, ${w.r.length} to review` : ''}</span>
      </div>
      <button className="primary-sm" onClick={() => (w.r.length ? start([], 'practice', { qs: w.r, label: `${w.t.name}: review` }) : start([w.t.id], 'practice', { label: w.t.name }))}>
        {w.r.length ? 'Review these' : 'Practice'} →
      </button>
    </div>
  )
}

function Home({ store, start, setStore }) {
  const [mode, setMode] = useState('practice')
  const [doShuffle, setDoShuffle] = useState(false)
  const [minutes, setMinutes] = useState('')
  const limit = Number(minutes) > 0 ? Math.round(Number(minutes) * 60) : null
  const missedCount = Object.keys(store.missed || {}).length
  const bookmarkCount = Object.keys(store.bookmarks || {}).length
  const total = TESTS.reduce((n, t) => n + t.questions.length, 0)

  return (
    <div className="wrap">
      <header className="hero">
        <p className="eyebrow">PSHS System</p>
        <h1>NCE Reviewer</h1>
        <p className="sub">{total} practice questions across {TESTS.length} tests. Pick a test, answer, and check yourself.</p>
      </header>

      <Search onOpen={(qs, idx) => start([], 'practice', { qs, idx, label: 'Search results' })} />

      <Progress progress={store.progress || {}} onOpen={(qs, idx, label) => start([], 'practice', { qs, idx, label })} />
      <Focus progress={store.progress || {}} start={start} />

      <section className="controls">
        <div className="seg" role="radiogroup" aria-label="Mode">
          <button className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>
            Practice <span>instant feedback</span>
          </button>
          <button className={mode === 'exam' ? 'on' : ''} onClick={() => setMode('exam')}>
            Exam <span>score at the end</span>
          </button>
          <button className={mode === 'study' ? 'on' : ''} onClick={() => setMode('study')}>
            Study <span>answers shown</span>
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={doShuffle} onChange={(e) => setDoShuffle(e.target.checked)} /> Shuffle questions
        </label>
      </section>

      <section className={mode === 'study' ? 'timer-pick off' : 'timer-pick'} aria-disabled={mode === 'study'}>
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
        <button
          className="card wide bm"
          disabled={!bookmarkCount}
          onClick={() => start(TESTS.map((t) => t.id), mode, { onlyBookmarked: true, shuffle: doShuffle, label: 'Bookmarked', limit })}
        >
          <span className="num">Saved</span>
          <strong>Bookmarked</strong>
          <span className="meta">{bookmarkCount ? `${bookmarkCount} saved` : 'Tap ☆ on a question to save it'}</span>
        </button>
      </section>

      {store.history?.length > 0 && (
        <section className="history">
          <div className="history-head">
            <h2>Recent attempts</h2>
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

      <Backup store={store} setStore={setStore} />

      <footer className="foot">
        Content from the PSHS System NCE Reviewer (2024), a free publication of the PSHS Admissions Office. Used with permission.
      </footer>
    </div>
  )
}

function Quiz({ session, setSession, onFinish, onQuit: quitNow, bookmarks, onBookmark }) {
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
  const study = mode === 'study'
  const onQuit = () => {
    if (!reviewing && mode === 'exam' && answeredCount > 0 && !window.confirm('Leave this exam? Your answers so far will not be saved.')) return
    quitNow()
  }

  const pick = (l) => {
    if (isRevealed) return
    const next = { ...session, answers: { ...answers, [q.id]: l } }
    if (mode === 'practice') next.revealed = { ...revealed, [q.id]: true }
    setSession(next)
  }
  const go = (i) => setSession({ ...session, idx: Math.max(0, Math.min(qs.length - 1, i)) })

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || document.querySelector('.modal')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toUpperCase()
      if (LETTERS.includes(k)) pick(k)
      else if (k === 'S') onBookmark(q.id)
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
          <span className="qhead-right">
            <span className="muted">Q{q.number} · {idx + 1} of {qs.length}</span>
            <button
              className={bookmarks[q.id] ? 'star on' : 'star'}
              onClick={() => onBookmark(q.id)}
              aria-pressed={!!bookmarks[q.id]}
              aria-label={bookmarks[q.id] ? 'Remove bookmark' : 'Bookmark this question'}
              title={bookmarks[q.id] ? 'Remove bookmark (S)' : 'Bookmark (S)'}
            >
              {bookmarks[q.id] ? '★' : '☆'}
            </button>
          </span>
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

        {study && <p className="verdict ok">Answer: {q.answer}</p>}
        {isRevealed && !study && (
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
      <p className="hint muted">Tip: press A–E to answer, ← → to move, S to bookmark.</p>
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
