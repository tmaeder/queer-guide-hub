import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { DEFAULT_PAGE_SIZE } from './config'
import { fetchPersonById } from './lib/query'
import { annotatedIds, checkedIds, toggleChecked } from './lib/notes'
import type { Personality } from './types'
import { PageSizer } from './PageSizer'
import { KebabMenu } from './KebabMenu'
import { PersonEditForm } from './PersonEditForm'
import { DetailPanel } from './DetailPanel'
import { ViewToggle, type Layout } from './ViewToggle'

interface Anniv {
  id: string
  name: string
  slug: string
  image_url: string | null
  profession: string | null
  anniversary: 'born' | 'died'
  occurs_on: string
  years_ago: number
  featured: boolean
}

const SITE = 'https://queer.guide'
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const annivLabel = (a: Anniv) =>
  a.anniversary === 'born' ? `${a.years_ago}. Geburtstag` : `† vor ${a.years_ago} J.`

export function Upcoming() {
  const [rows, setRows] = useState<Anniv[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [visible, setVisible] = useState(DEFAULT_PAGE_SIZE)
  const [layout, setLayout] = useState<Layout>('list')
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'born' | 'died'>('all')
  const [editing, setEditing] = useState<Personality | null>(null)

  // split view selection
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<Personality | null>(null)
  const [annotated, setAnnotated] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const refreshLocal = useCallback(() => {
    setAnnotated(annotatedIds())
    setChecked(checkedIds())
  }, [])

  const openEdit = async (id: string) => {
    try {
      const p = await fetchPersonById(id)
      if (p) setEditing(p)
    } catch { /* ignore */ }
  }

  const selectRow = async (id: string) => {
    setSelectedId(id)
    setSelectedPerson(null)
    try {
      setSelectedPerson(await fetchPersonById(id))
    } catch { /* ignore */ }
  }

  const range = useMemo(() => {
    const from = new Date()
    const to = new Date()
    to.setDate(to.getDate() + 30)
    return { from: isoDay(from), to: isoDay(to) }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError('')
      const { data, error } = await supabase.rpc('personalities_anniversaries', {
        p_from: range.from,
        p_to: range.to,
      })
      if (!alive) return
      if (error) setError(error.message)
      else setRows((data ?? []) as Anniv[])
      refreshLocal()
      setLoading(false)
    })()
    return () => { alive = false }
  }, [range, refreshLocal])

  // Reset the visible window when the page size changes — during render
  // (tracking the previous size) rather than in an effect.
  const [lastPageSize, setLastPageSize] = useState(pageSize)
  if (pageSize !== lastPageSize) {
    setLastPageSize(pageSize)
    setVisible(pageSize)
  }

  // Filters, then window.
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (type !== 'all' && r.anniversary !== type) return false
      if (term && !(`${r.name} ${r.profession ?? ''}`.toLowerCase().includes(term))) return false
      return true
    })
  }, [rows, q, type])

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length
  const groups = useMemo(() => {
    const m = new Map<string, Anniv[]>()
    for (const r of shown) (m.get(r.occurs_on) ?? m.set(r.occurs_on, []).get(r.occurs_on)!).push(r)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long' })

  if (editing) {
    return <div className="dash"><PersonEditForm p={editing} onClose={() => setEditing(null)} /></div>
  }

  const rowKebab = (a: Anniv) => (
    <KebabMenu
      items={[
        { label: 'Bearbeiten', onClick: () => openEdit(a.id) },
        { label: 'Auf queer.guide öffnen', onClick: () => window.open(`${SITE}/personalities/${a.slug}`, '_blank', 'noreferrer') },
        { label: 'Als geprüft', disabled: true, hint: 'soon' },
        { label: 'Send to…', disabled: true, hint: 'soon' },
      ]}
    />
  )

  const filterBar = (
    <div className="liste-filters">
      <input type="text" placeholder="Name oder Beruf…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={type} onChange={(e) => setType(e.target.value as 'all' | 'born' | 'died')}>
        <option value="all">Anlass: alle</option>
        <option value="born">Geburtstag</option>
        <option value="died">Todestag</option>
      </select>
      <PageSizer value={pageSize} onChange={setPageSize} />
      <ViewToggle value={layout} onChange={setLayout} />
      <span className="count">{shown.length} von {filtered.length}</span>
    </div>
  )

  const head = (
    <div className="dash-head">
      <h2>Upcoming — Jahrestage (30 Tage)</h2>
      <p className="hint">
        Geburts- &amp; Todestage öffentlicher Personen, {range.from} bis {range.to}.
        {loading && ' · lädt…'}
        {error && <span className="err"> · Fehler: {error}</span>}
      </p>
      {filterBar}
    </div>
  )

  const pager = (
    <div className="pager">
      {hasMore ? (
        <button onClick={() => setVisible((v) => v + pageSize)}>More ({Math.min(pageSize, filtered.length - visible)} mehr)</button>
      ) : (
        !loading && filtered.length > 0 && <span className="count">alle geladen</span>
      )}
    </div>
  )

  // Geteilte Ansicht (flache Liste + Detail).
  if (layout === 'split') {
    return (
      <div className="dash">
        {head}
        <div className="body">
          <div className="list">
            {shown.map((a) => (
              <div
                key={a.id + a.anniversary}
                className={'row' + (selectedId === a.id ? ' sel' : '')}
                role="button"
                tabIndex={0}
                onClick={() => selectRow(a.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectRow(a.id)
                  }
                }}
              >
                {checked.has(a.id) && <span className="check">✓</span>}
                {a.image_url ? <img src={a.image_url} alt="" loading="lazy" /> : <span className="noimg">—</span>}
                <div className="meta">
                  <div className="name">
                    {annotated.has(a.id) && <span className="dot" />}{' '}
                    {a.name}
                    <span className={'pill' + (a.anniversary === 'died' ? ' warn' : '')}>{annivLabel(a)}</span>
                  </div>
                  <div className="sub">{[a.profession, fmtDate(a.occurs_on)].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            ))}
            {pager}
          </div>
          <DetailPanel
            p={selectedPerson}
            isChecked={selectedPerson ? checked.has(selectedPerson.id) : false}
            onToggleChecked={() => { if (selectedPerson) { toggleChecked(selectedPerson.id); refreshLocal() } }}
            onLocalChange={refreshLocal}
          />
        </div>
      </div>
    )
  }

  // Ausführliche Listenansicht (nach Datum gruppiert, volle Breite).
  return (
    <div className="dash">
      {head}
      {!loading && !error && groups.length === 0 && <p className="hint">Keine Jahrestage.</p>}
      {groups.map(([day, items]) => (
        <div className="anniv-group" key={day}>
          <h3 className="anniv-date">{fmtDate(day)}</h3>
          {items.map((a) => (
            <div className="anniv-row" key={a.id + a.anniversary}>
              {a.image_url ? <img src={a.image_url} alt="" loading="lazy" /> : <span className="noimg">—</span>}
              <span className="meta">
                <span className="name">
                  {a.name}
                  <span className={'pill' + (a.anniversary === 'died' ? ' warn' : '')}>{annivLabel(a)}</span>
                </span>
                <span className="sub">{a.profession}</span>
              </span>
              {rowKebab(a)}
            </div>
          ))}
        </div>
      ))}
      {pager}
    </div>
  )
}
