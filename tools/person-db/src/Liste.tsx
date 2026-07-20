import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { DEFAULT_PAGE_SIZE } from './config'
import { fetchAlpha } from './lib/query'
import { annotatedIds, checkedIds, toggleChecked } from './lib/notes'
import { withFlag } from './lib/flags'
import { personDatasheet } from './lib/pdf'
import {
  emptyPersonality,
  EMPTY_LISTE_FILTERS,
  REVIEW_STATUS_VALUES,
  VISIBILITY_VALUES,
  type ListeFilters,
  type Personality,
} from './types'
import { DetailPanel } from './DetailPanel'
import { PageSizer } from './PageSizer'
import { PersonEditForm } from './PersonEditForm'
import { NewMenu, captureOptions } from './NewMenu'
import { KebabMenu } from './KebabMenu'
import { StatusDot } from './StatusDot'
import { ViewToggle, type Layout } from './ViewToggle'

export function Liste() {
  const [layout, setLayout] = useState<Layout>('split')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [filters, setFilters] = useState<ListeFilters>(EMPTY_LISTE_FILTERS)
  const [rows, setRows] = useState<Personality[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [annotated, setAnnotated] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<Personality | null>(null)
  const [editing, setEditing] = useState<Personality | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Foto-Upload: read the picked image as a local data-URL, open the new-person
  // mask with it as the image. Purely local preview (no upload) in read-only v1.
  const onPhotoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      const reader = new FileReader()
      reader.onload = () => setCreating({ ...emptyPersonality(), image_url: String(reader.result) })
      reader.readAsDataURL(f)
    }
    e.target.value = ''
  }

  const refreshLocal = useCallback(() => {
    setAnnotated(annotatedIds())
    setChecked(checkedIds())
  }, [])

  const setF = (patch: Partial<ListeFilters>) =>
    setFilters((f) => ({ ...f, ...patch }))

  const load = useCallback(
    async (offset: number, size: number, reset: boolean) => {
      setLoading(true)
      setError('')
      try {
        const batch = await fetchAlpha(offset, size, filters)
        setRows((prev) => (reset ? batch : [...prev, ...batch]))
        setDone(batch.length < size)
        refreshLocal()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [refreshLocal, filters],
  )

  const debounceRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setRows([])
      setDone(false)
      load(0, pageSize, true)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [pageSize, load])

  const selected = rows.find((r) => r.id === selectedId) ?? null
  const check = useCallback(() => {
    if (!selectedId) return
    toggleChecked(selectedId)
    refreshLocal()
  }, [selectedId, refreshLocal])

  const rowKebab = (p: Personality) => (
    <KebabMenu
      items={[
        { label: 'Bearbeiten', onClick: () => setEditing(p) },
        { label: 'PDF', onClick: () => personDatasheet(p) },
        {
          label: checked.has(p.id) ? 'Unmark checked' : 'Mark checked',
          onClick: () => { toggleChecked(p.id); refreshLocal() },
        },
      ]}
    />
  )

  if (creating) {
    return <div className="dash"><PersonEditForm p={creating} onClose={() => setCreating(null)} /></div>
  }
  if (editing) {
    return <div className="dash"><PersonEditForm p={editing} onClose={() => setEditing(null)} /></div>
  }

  const filterBar = (
    <div className="liste-filters">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoFile} />
      <NewMenu
        align="left"
        options={captureOptions({
          onManual: () => setCreating(emptyPersonality()),
          onPhoto: () => fileRef.current?.click(),
        })}
      />
      <input type="text" placeholder="Suche (Name)…" value={filters.search} onChange={(e) => setF({ search: e.target.value })} />
      <input type="text" placeholder="Beruf enthält…" value={filters.profession} onChange={(e) => setF({ profession: e.target.value })} />
      <input type="text" placeholder="Land enthält…" value={filters.nationality} onChange={(e) => setF({ nationality: e.target.value })} />
      <select value={filters.visibility} onChange={(e) => setF({ visibility: e.target.value })}>
        <option value="">Sichtbarkeit: alle</option>
        {VISIBILITY_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select value={filters.reviewStatus} onChange={(e) => setF({ reviewStatus: e.target.value })}>
        <option value="">Review: alle</option>
        {REVIEW_STATUS_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <PageSizer value={pageSize} onChange={setPageSize} />
      <ViewToggle value={layout} onChange={setLayout} />
      <span className="count">{rows.length} geladen</span>
    </div>
  )

  const pager = (
    <div className="pager">
      {loading && <span className="count">lädt…</span>}
      {!loading && !done && (
        <button onClick={() => load(rows.length, pageSize, false)}>More ({pageSize} mehr)</button>
      )}
      {done && !loading && <span className="count">alle geladen</span>}
    </div>
  )

  const head = (
    <>
      <div className="dash-head">
        <h2>Personen — alphabetisch</h2>
        <p className="hint">Alle Live-Personen. Filter + Ansicht wählen.</p>
      </div>
      {filterBar}
    </>
  )

  // Ausführliche Listenansicht (volle Breite, Aktionen je Zeile).
  if (layout === 'list') {
    return (
      <div className="dash">
        {head}
        {error && <div className="error">Fehler: {error}</div>}
        <div className="list-full">
          {rows.map((p) => (
            <div className="row-full" key={p.id}>
              {checked.has(p.id) && <span className="check" title="lokal geprüft">✓</span>}
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="noimg">—</span>}
              <div className="meta">
                <div className="name">
                  <StatusDot p={p} />{' '}
                  {annotated.has(p.id) && <span className="dot" title="lokale Notiz" />}{' '}
                  {p.name}
                  {p.visibility !== 'public' && <span className="pill">{p.visibility}</span>}
                  {p.needs_attention && <span className="pill warn">attention</span>}
                </div>
                <div className="sub">
                  {[p.profession, withFlag(p.nationality), [p.birth_date, p.death_date].filter(Boolean).join(' – ')]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {p.description && <div className="sub2">{p.description}</div>}
              </div>
              <div className="row-actions">
                <span className="pill">{p.review_status}</span>
                {rowKebab(p)}
              </div>
            </div>
          ))}
        </div>
        {pager}
      </div>
    )
  }

  // Geteilte Ansicht (volle Breite Kopf + Liste + Detail).
  return (
    <div className="dash">
      {head}
      <div className="body">
        <div className="list">
          {error && <div className="error">Fehler: {error}</div>}
          {rows.map((p) => (
            <div
              key={p.id}
              className={'row' + (selectedId === p.id ? ' sel' : '')}
              onClick={() => setSelectedId(p.id)}
            >
              {checked.has(p.id) && <span className="check" title="lokal geprüft">✓</span>}
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="noimg">—</span>}
              <div className="meta">
                <div className="name">
                  <StatusDot p={p} />{' '}
                  {annotated.has(p.id) && <span className="dot" title="lokale Notiz" />}{' '}
                  {p.name}
                  {p.visibility !== 'public' && <span className="pill">{p.visibility}</span>}
                  {p.needs_attention && <span className="pill warn">attention</span>}
                </div>
                <div className="sub">
                  {[p.profession, withFlag(p.nationality), p.birth_date?.slice(0, 4)].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          ))}
          {pager}
        </div>

        <DetailPanel
          p={selected}
          isChecked={selected ? checked.has(selected.id) : false}
          onToggleChecked={check}
          onLocalChange={refreshLocal}
        />
      </div>
    </div>
  )
}
