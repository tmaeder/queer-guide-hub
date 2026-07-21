import { useEffect, useRef, useState } from 'react'
import {
  IMPACT_LABEL,
  IMPACT_VALUES,
  makeMilestoneId,
  saveMilestone,
  type LinkedPerson,
  type Milestone,
  type MilestoneSource,
} from './lib/milestones'
import { searchPersons } from './lib/query'
import { CityAutocomplete } from './CityAutocomplete'

// Create / edit a milestone. Saves to the local store.
export function MilestoneForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Milestone
  onSaved: () => void
  onCancel: () => void
}) {
  const [m, setM] = useState<Milestone>(initial)
  const upd = (patch: Partial<Milestone>) => setM((p) => ({ ...p, ...patch }))

  // ---- person link search ----
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<LinkedPerson[]>([])
  const debounce = useRef<number | undefined>(undefined)
  useEffect(() => {
    const t = term.trim()
    if (!t) return
    clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      searchPersons(t).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [term])

  const addPerson = (p: LinkedPerson) => {
    if (m.linked_persons.some((x) => x.slug === p.slug)) return
    upd({ linked_persons: [...m.linked_persons, p] })
    setTerm('')
    setResults([])
  }
  const removePerson = (slug: string) =>
    upd({ linked_persons: m.linked_persons.filter((x) => x.slug !== slug) })
  const setRole = (slug: string, role: string) =>
    upd({ linked_persons: m.linked_persons.map((x) => (x.slug === slug ? { ...x, role } : x)) })

  // ---- sources (simple line-based editor) ----
  const sourcesText = m.sources
    .map((s) => (s.url ? `${s.label} | ${s.url}` : s.label))
    .join('\n')
  const setSources = (text: string) => {
    const list: MilestoneSource[] = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [label, url] = l.split('|').map((x) => x.trim())
        return url ? { label, url } : { label }
      })
    upd({ sources: list })
  }

  const canSave = m.title.trim() && m.date.trim()
  const save = () => {
    const id = m.id || makeMilestoneId(m.title)
    saveMilestone({ ...m, id })
    onSaved()
  }

  const T = (k: keyof Milestone, label: string) => (
    <label className="ef">
      <span>{label}</span>
      <input value={String(m[k] ?? '')} onChange={(e) => upd({ [k]: e.target.value } as Partial<Milestone>)} />
    </label>
  )

  return (
    <div className="detail edit">
      <div className="detail-top">
        <h2>{initial.id ? 'Milestone bearbeiten' : 'Neuer Milestone'}</h2>
        <button className="check-btn" onClick={onCancel}>‹ zurück</button>
      </div>

      <h3 className="ef-group">Ereignis</h3>
      {T('title', 'Titel *')}
      {T('date', 'Datum * (YYYY-MM-DD / YYYY)')}
      {T('date_end', 'Datum bis')}
      {T('location', 'Ort (Venue/Straße)')}
      <label className="ef" htmlFor="mf-city">
        <span>Stadt</span>
        <CityAutocomplete id="mf-city" value={m.city ?? ''} onChange={(v) => upd({ city: v })} placeholder="Stadt suchen (queer.guide)…" />
      </label>
      {T('region', 'Region')}
      {T('country', 'Land')}
      {T('category', 'Kategorie')}

      <label className="ef ef-wide">
        <span>Beschreibung</span>
        <textarea value={m.description} onChange={(e) => upd({ description: e.target.value })} />
      </label>

      <h3 className="ef-group">Wertung</h3>
      <label className="ef">
        <span>Wichtigkeit (1–5)</span>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={'star' + (n <= m.significance ? ' on' : '')}
              onClick={() => upd({ significance: n })}
            >
              ★
            </button>
          ))}
        </div>
      </label>
      <label className="ef">
        <span>Richtung</span>
        <select value={m.impact} onChange={(e) => upd({ impact: e.target.value as Milestone['impact'] })}>
          {IMPACT_VALUES.map((v) => <option key={v} value={v}>{IMPACT_LABEL[v]}</option>)}
        </select>
      </label>

      <h3 className="ef-group">Quellen (eine pro Zeile: Label | URL)</h3>
      <label className="ef ef-wide">
        <span>Quellen</span>
        <textarea value={sourcesText} onChange={(e) => setSources(e.target.value)} />
      </label>

      <h3 className="ef-group">Verknüpfte Personen</h3>
      <div className="link-box">
        <input
          type="text"
          placeholder="Person suchen (Name)…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {term.trim() && results.length > 0 && (
          <div className="link-results">
            {results.map((r) => (
              <button key={r.slug} className="link-result" onClick={() => addPerson(r)}>
                {r.name} <span className="muted">{r.slug}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="linkrole-list">
        {m.linked_persons.map((p) => (
          <div className="linkrole-row" key={p.slug}>
            <span className="linkrole-name">{p.name}</span>
            <input
              className="linkrole-input"
              type="text"
              placeholder="Zusammenhang / Rolle…"
              value={p.role ?? ''}
              onChange={(e) => setRole(p.slug, e.target.value)}
            />
            <button className="mlink-x" onClick={() => removePerson(p.slug)} title="entfernen">×</button>
          </div>
        ))}
        {m.linked_persons.length === 0 && <span className="hint">noch keine verknüpft</span>}
      </div>

      <div className="edit-actions">
        <button onClick={onCancel}>Abbrechen</button>
        <button className="primary" disabled={!canSave} onClick={save} title={canSave ? '' : 'Titel + Datum nötig'}>
          Speichern
        </button>
      </div>
    </div>
  )
}
