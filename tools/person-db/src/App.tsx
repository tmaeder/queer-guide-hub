import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errMsg } from './lib/errMsg'
import { PAGE_SIZE } from './config'
import { fetchPersonalities } from './lib/query'
import { exportCsv, exportJson } from './lib/export'
import { annotatedIds, checkedIds, toggleChecked } from './lib/notes'
import { withFlag } from './lib/flags'
import { StatusDot } from './StatusDot'
import {
  COHORTS,
  EMPTY_FILTERS,
  REVIEW_STATUS_VALUES,
  VISIBILITY_VALUES,
  type Cohort,
  type Filters,
  type Personality,
} from './types'
import { DetailPanel } from './DetailPanel'
import { Dashboard } from './Dashboard'
import { NavBar, type View } from './NavBar'
import { Upcoming } from './Upcoming'
import { Liste } from './Liste'
import { DuplicateReview } from './DuplicateReview'
import { QualityDashboard } from './QualityDashboard'

export function App() {
  const [view, setView] = useState<View>('dashboard')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Personality[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [annotated, setAnnotated] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const debounceRef = useRef<number | undefined>(undefined)
  const set = (patch: Partial<Filters>) => {
    setPage(0)
    setFilters((f) => ({ ...f, ...patch }))
  }

  const refreshLocal = useCallback(() => {
    setAnnotated(annotatedIds())
    setChecked(checkedIds())
  }, [])

  useEffect(() => {
    if (view !== 'list') return
    clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setLoading(true)
      setError('')
      fetchPersonalities(filters, page)
        .then((r) => {
          setRows(r.rows)
          setCount(r.count)
          refreshLocal()
        })
        .catch((e) => setError(errMsg(e)))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [filters, page, view, refreshLocal])

  // Rows actually shown (client-side hide-checked toggle).
  const shown = useMemo(
    () => (filters.hideChecked ? rows.filter((r) => !checked.has(r.id)) : rows),
    [rows, checked, filters.hideChecked],
  )
  const selected = shown.find((r) => r.id === selectedId) ?? null

  const pickCohort = (c: Cohort) => {
    if (c === 'duplicates') {
      setView('duplicates')
      return
    }
    setFilters({ ...EMPTY_FILTERS, cohort: c })
    setPage(0)
    setSelectedId(null)
    setView('list')
  }

  const move = useCallback(
    (delta: number) => {
      if (!shown.length) return
      const i = shown.findIndex((r) => r.id === selectedId)
      const next = i < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, i + delta))
      setSelectedId(shown[next].id)
    },
    [shown, selectedId],
  )

  const check = useCallback(() => {
    if (!selectedId) return
    toggleChecked(selectedId)
    refreshLocal()
  }, [selectedId, refreshLocal])

  // Keyboard: n/j next, p/k prev, c toggle checked. Ignore while typing.
  useEffect(() => {
    if (view !== 'list') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key === 'n' || e.key === 'j') { move(1); e.preventDefault() }
      else if (e.key === 'p' || e.key === 'k') { move(-1); e.preventDefault() }
      else if (e.key === 'c') { check(); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, move, check])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const cohortLabel = COHORTS.find((c) => c.key === filters.cohort)?.label ?? 'Alle'
  const rangeLabel = useMemo(() => {
    if (!count) return '0'
    const from = page * PAGE_SIZE + 1
    const to = Math.min(count, from + rows.length - 1)
    return `${from}–${to} von ~${count.toLocaleString('de-DE')}`
  }, [page, rows.length, count])

  return (
    <div className="app">
      <NavBar active={view} onNavigate={setView} />

      {view === 'dashboard' && <Dashboard onPick={pickCohort} />}
      {view === 'liste' && <Liste />}
      {view === 'upcoming' && <Upcoming />}
      {view === 'quality' && <QualityDashboard />}
      {view === 'duplicates' && <DuplicateReview onClose={() => setView('dashboard')} />}

      {view === 'list' && (
      <>
      <header className="bar">
        <button onClick={() => setView('dashboard')} title="zum Dashboard">‹ Dashboard</button>
        <strong className="cohort-name">{cohortLabel}</strong>
        <div className="filters">
          <input
            type="text"
            placeholder="Name oder Beruf…"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
          />
          <select value={filters.visibility} onChange={(e) => set({ visibility: e.target.value })}>
            <option value="">Sichtbarkeit: alle</option>
            {VISIBILITY_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.reviewStatus} onChange={(e) => set({ reviewStatus: e.target.value })}>
            <option value="">Review: alle</option>
            {REVIEW_STATUS_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={filters.needsAttention}
            onChange={(e) => set({ needsAttention: e.target.value as Filters['needsAttention'] })}
          >
            <option value="any">Attention: egal</option>
            <option value="yes">nur needs_attention</option>
            <option value="no">ohne</option>
          </select>
          <label className="chk">
            <input
              type="checkbox"
              checked={filters.hideChecked}
              onChange={(e) => set({ hideChecked: e.target.checked })}
            />
            geprüfte ausblenden
          </label>
          <button onClick={() => exportCsv(shown)} title="Angezeigte als CSV">CSV</button>
          <button onClick={() => exportJson(shown)} title="Angezeigte als JSON">JSON</button>
        </div>
        <span className="count">{rangeLabel}</span>
      </header>

      <div className="body">
        <div className="list">
          {error && <div className="error">Fehler: {error}</div>}
          {loading && <div className="loading">lädt…</div>}
          {!loading && !error && shown.length === 0 && (
            <div className="loading">Keine (ungeprüften) Treffer auf dieser Seite.</div>
          )}
          {shown.map((p) => (
            <div
              key={p.id}
              className={'row' + (selectedId === p.id ? ' sel' : '')}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedId(p.id)
                }
              }}
            >
              {checked.has(p.id) && <span className="check" title="lokal geprüft">✓</span>}
              {p.image_url ? (
                <img src={p.image_url} alt="" loading="lazy" />
              ) : (
                <span className="noimg">—</span>
              )}
              <div className="meta">
                <div className="name">
                  <StatusDot p={p} />{' '}
                  {annotated.has(p.id) && <span className="dot" title="lokale Notiz" />}{' '}
                  {p.name}
                  {p.visibility !== 'public' && <span className="pill">{p.visibility}</span>}
                  {p.needs_attention && <span className="pill warn">attention</span>}
                </div>
                <div className="sub">
                  {[p.profession, withFlag(p.nationality), p.birth_date?.slice(0, 4)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
          ))}
          <div className="pager">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ zurück</button>
            <span className="count">Seite {page + 1} / {totalPages}</span>
            <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>weiter ›</button>
          </div>
        </div>

        <DetailPanel
          p={selected}
          isChecked={selected ? checked.has(selected.id) : false}
          onToggleChecked={check}
          onLocalChange={refreshLocal}
        />
      </div>
      </>
      )}
    </div>
  )
}
