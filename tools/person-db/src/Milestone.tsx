import { useState } from 'react'
import {
  deleteMilestone,
  emptyMilestone,
  getMilestones,
  getMilestone,
  IMPACT_LABEL,
  IMPACT_VALUES,
  toggleMilestoneChecked,
  type Milestone as MS,
} from './lib/milestones'
import { milestoneDatasheet } from './lib/pdf'
import { withFlag } from './lib/flags'
import { KebabMenu } from './KebabMenu'
import { MilestoneForm } from './MilestoneForm'
import { Timeline } from './Timeline'
import { NewMenu, captureOptions } from './NewMenu'

const SITE = 'https://queer.guide'

function Row({ k, v }: { k: string; v?: string }) {
  if (!v) return null
  return (
    <div className="field">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

function Card({
  m,
  onChange,
  onEdit,
}: {
  m: MS
  onChange: () => void
  onEdit: (id: string) => void
}) {
  const when = [m.date, m.date_end].filter(Boolean).join(' – ')
  const impCls = m.impact === 'positive' ? 'imp-pos' : m.impact === 'negative' ? 'imp-neg' : 'imp-neu'
  return (
    <div className="ms-card">
      <div className="detail-top">
        <div>
          <h3 className="ms-title">{m.title}</h3>
          <p className="prof">{[m.city, m.region, withFlag(m.country)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="detail-actions">
          {m.checked && <span className="checked-tag">✓ geprüft</span>}
          <KebabMenu
            items={[
              { label: 'Edit', onClick: () => onEdit(m.id) },
              { label: 'PDF (Datenblatt)', onClick: () => milestoneDatasheet(m) },
              {
                label: m.checked ? 'Unmark checked' : 'Mark checked',
                onClick: () => { toggleMilestoneChecked(m.id); onChange() },
              },
              {
                label: 'Löschen',
                onClick: () => { if (confirm(`"${m.title}" löschen?`)) { deleteMilestone(m.id); onChange() } },
              },
            ]}
          />
        </div>
      </div>

      <div className="ms-rating">
        <span className="tl-stars" title={`Wichtigkeit ${m.significance}/5`}>
          {'★'.repeat(m.significance)}<span className="star-off">{'★'.repeat(5 - m.significance)}</span>
        </span>
        <span className={'imp-badge ' + impCls}>{IMPACT_LABEL[m.impact]}</span>
      </div>

      <Row k="Datum" v={when} />
      <Row k="Ort" v={m.location} />
      <Row k="Stadt" v={m.city} />
      <Row k="Region" v={m.region} />
      <Row k="Land" v={withFlag(m.country)} />
      <Row k="Kategorie" v={m.category} />

      <div className="field">
        <span className="k">Beschreibung</span>
        <span className="v">{m.description}</span>
      </div>

      <div className="field">
        <span className="k">Quellen</span>
        <span className={'v' + (m.sources.length ? '' : ' missing')}>
          {m.sources.length
            ? m.sources.map((s, i) => (
                <div key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}</div>
              ))
            : '—'}
        </span>
      </div>

      <div className="field">
        <span className="k">Verknüpfte Personen</span>
        <span className={'v' + (m.linked_persons.length ? '' : ' missing')}>
          {m.linked_persons.length
            ? m.linked_persons.map((p) => (
                <div key={p.slug}>
                  <a href={`${SITE}/personalities/${p.slug}`} target="_blank" rel="noreferrer">{p.name}</a>
                  {p.role && <span className="muted"> — {p.role}</span>}
                </div>
              ))
            : 'noch keine'}
        </span>
      </div>
    </div>
  )
}

type Mode = { kind: 'list' } | { kind: 'timeline' } | { kind: 'form'; initial: MS }

interface MFilters {
  q: string
  impact: string
  category: string
  checked: 'all' | 'yes' | 'no'
}
const EMPTY_MF: MFilters = { q: '', impact: '', category: '', checked: 'all' }

export function Milestone() {
  const [items, setItems] = useState<MS[]>(() => getMilestones())
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [f, setF] = useState<MFilters>(EMPTY_MF)
  const refresh = () => setItems(getMilestones())

  const setFilter = (patch: Partial<MFilters>) => setF((p) => ({ ...p, ...patch }))
  const categories = [...new Set(items.map((m) => m.category).filter(Boolean))] as string[]

  const filtered = items.filter((m) => {
    if (f.impact && m.impact !== f.impact) return false
    if (f.category && m.category !== f.category) return false
    if (f.checked === 'yes' && !m.checked) return false
    if (f.checked === 'no' && m.checked) return false
    if (f.q.trim()) {
      const hay = `${m.title} ${m.description} ${m.city ?? ''} ${m.country ?? ''}`.toLowerCase()
      if (!hay.includes(f.q.trim().toLowerCase())) return false
    }
    return true
  })

  if (mode.kind === 'form') {
    return (
      <div className="dash">
        <MilestoneForm
          initial={mode.initial}
          onSaved={() => { refresh(); setMode({ kind: 'list' }) }}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </div>
    )
  }

  const openEdit = (id: string) => {
    const m = getMilestone(id)
    if (m) setMode({ kind: 'form', initial: m })
  }

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>Milestone — Queere Geschichte</h2>
        <p className="hint">
          Ereignisse queerer Geschichte, mit Personen verknüpfbar, mit Wertung
          (Wichtigkeit 1–5 + Richtung). Daten lokal im Tool (noch nicht Live-DB).
        </p>
        <div className="liste-filters">
          <NewMenu
            align="left"
            options={captureOptions({ onManual: () => setMode({ kind: 'form', initial: emptyMilestone() }) })}
          />
          <input
            type="text"
            placeholder="Suche (Titel, Ort, Text)…"
            value={f.q}
            onChange={(e) => setFilter({ q: e.target.value })}
          />
          <select value={f.impact} onChange={(e) => setFilter({ impact: e.target.value })}>
            <option value="">Richtung: alle</option>
            {IMPACT_VALUES.map((v) => <option key={v} value={v}>{IMPACT_LABEL[v]}</option>)}
          </select>
          <select value={f.category} onChange={(e) => setFilter({ category: e.target.value })}>
            <option value="">Kategorie: alle</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.checked} onChange={(e) => setFilter({ checked: e.target.value as MFilters['checked'] })}>
            <option value="all">Geprüft: egal</option>
            <option value="yes">nur geprüft</option>
            <option value="no">nur ungeprüft</option>
          </select>
          <div className="seg">
            <button className={mode.kind === 'list' ? 'on' : ''} onClick={() => setMode({ kind: 'list' })}>Karten</button>
            <button className={mode.kind === 'timeline' ? 'on' : ''} onClick={() => setMode({ kind: 'timeline' })}>Zeitstrahl</button>
          </div>
          <span className="count">{filtered.length} / {items.length}</span>
        </div>
      </div>

      {mode.kind === 'timeline' ? (
        <Timeline items={filtered} onOpen={openEdit} />
      ) : filtered.length === 0 ? (
        <p className="hint">Keine Milestones für diese Filter.</p>
      ) : (
        filtered.map((m) => <Card key={m.id} m={m} onChange={refresh} onEdit={openEdit} />)
      )}
    </div>
  )
}
