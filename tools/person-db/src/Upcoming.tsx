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
import { queerDaysInRange, type QueerDayEvent } from './lib/queerDays'

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
  a.anniversary === 'born' ? `🎂 ${a.years_ago}. Geburtstag` : `🕯️ † vor ${a.years_ago} J.`

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

  // Queere Aktionstage im Fenster (nur wenn Anlass-Filter "alle"; Suche greift auf den Namen).
  const dayEvents = useMemo(() => {
    if (type !== 'all') return [] as QueerDayEvent[]
    const term = q.trim().toLowerCase()
    return queerDaysInRange(range.from, range.to).filter((d) => !term || d.name.toLowerCase().includes(term))
  }, [range, type, q])

  // Gruppiert nach Datum: Aktionstage + Personen-Jahrestage.
  const groups = useMemo(() => {
    const m = new Map<string, { anniv: Anniv[]; days: QueerDayEvent[] }>()
    const ensure = (d: string) => { let g = m.get(d); if (!g) { g = { anniv: [], days: [] }; m.set(d, g) } return g }
    for (const r of shown) ensure(r.occurs_on).anniv.push(r)
    for (const d of dayEvents) ensure(d.occurs_on).days.push(d)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown, dayEvents])

  // Geteilte Ansicht: flache, nach Datum sortierte Mischung.
  const splitItems = useMemo(() => {
    type Item = { kind: 'anniv'; a: Anniv } | { kind: 'day'; d: QueerDayEvent }
    const items: Item[] = [
      ...shown.map((a): Item => ({ kind: 'anniv', a })),
      ...dayEvents.map((d): Item => ({ kind: 'day', d })),
    ]
    const dateOf = (i: Item) => (i.kind === 'anniv' ? i.a.occurs_on : i.d.occurs_on)
    return items.sort((x, y) => dateOf(x).localeCompare(dateOf(y)))
  }, [shown, dayEvents])

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
    <>
      <div className="dash-head">
        <h2>Upcoming — Jahrestage (30 Tage)</h2>
        <p className="hint">
          Geburts- &amp; Todestage öffentlicher Personen, {range.from} bis {range.to}.
          {loading && ' · lädt…'}
          {error && <span className="err"> · Fehler: {error}</span>}
        </p>
      </div>
      {filterBar}
    </>
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
            {splitItems.map((it) =>
              it.kind === 'day' ? (
                <div key={'day-' + it.d.name} className="row row-day">
                  <span className="day-ico" aria-hidden>🏳️‍🌈</span>
                  <div className="meta">
                    <div className="name">{it.d.name}<span className="pill day-pill">Aktionstag</span></div>
                    <div className="sub">{[it.d.note, fmtDate(it.d.occurs_on)].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              ) : (
                <div
                  key={it.a.id + it.a.anniversary}
                  className={'row' + (selectedId === it.a.id ? ' sel' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectRow(it.a.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      selectRow(it.a.id)
                    }
                  }}
                >
                  {checked.has(it.a.id) && <span className="check">✓</span>}
                  {it.a.image_url ? <img src={it.a.image_url} alt="" loading="lazy" /> : <span className="noimg">—</span>}
                  <div className="meta">
                    <div className="name">
                      {annotated.has(it.a.id) && <span className="dot" />}{' '}
                      {it.a.name}
                      <span className={'pill' + (it.a.anniversary === 'died' ? ' warn' : '')}>{annivLabel(it.a)}</span>
                    </div>
                    <div className="sub">{[it.a.profession, fmtDate(it.a.occurs_on)].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              ),
            )}
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
      {groups.map(([day, g]) => (
        <div className="anniv-group" key={day}>
          <h3 className="anniv-date">{fmtDate(day)}</h3>
          {g.days.map((d) => (
            <div className="anniv-row anniv-day" key={'day-' + d.name}>
              <span className="day-ico" aria-hidden>🏳️‍🌈</span>
              <span className="meta">
                <span className="name">{d.name}<span className="pill day-pill">Aktionstag</span></span>
                {d.note && <span className="sub">{d.note}</span>}
              </span>
            </div>
          ))}
          {g.anniv.map((a) => (
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
