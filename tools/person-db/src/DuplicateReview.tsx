import { useEffect, useState } from 'react'
import { fetchDuplicatePairs, type DupPair } from './lib/query'
import { withFlag } from './lib/flags'
import type { Personality } from './types'

const SITE = 'https://queer.guide'

// Fields compared side by side. Matching (non-empty, equal) = suspicious signal.
const FIELDS: { key: keyof Personality; label: string; flag?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'profession', label: 'Beruf' },
  { key: 'nationality', label: 'Nationalität', flag: true },
  { key: 'birth_date', label: 'Geburtsdatum' },
  { key: 'death_date', label: 'Todesdatum' },
  { key: 'birth_place', label: 'Geburtsort' },
  { key: 'wikidata_qid', label: 'Wikidata' },
  { key: 'slug', label: 'Slug' },
  { key: 'visibility', label: 'Sichtbarkeit' },
  { key: 'description', label: 'Beschreibung' },
]

const norm = (v: unknown) => (v == null ? '' : String(v).trim().toLowerCase())
const show = (v: unknown, flag?: boolean) => {
  if (v == null || v === '') return '—'
  return flag ? withFlag(String(v)) : String(v)
}

export function DuplicateReview({ onClose }: { onClose: () => void }) {
  const [pairs, setPairs] = useState<DupPair[]>([])
  const [i, setI] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    fetchDuplicatePairs(100)
      .then((p) => alive && setPairs(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  if (loading) return <div className="dash"><p className="hint">Duplikate laden…</p></div>
  if (error) return <div className="dash"><p className="hint err">Fehler: {error}</p></div>
  if (!pairs.length) return <div className="dash"><p className="hint">Keine Duplikat-Paare.</p></div>

  const done = i >= pairs.length
  const pair = pairs[i]
  const matches = done ? 0 : FIELDS.filter((f) => {
    const a = norm(pair.left[f.key]); const b = norm(pair.right[f.key])
    return a && a === b
  }).length

  const next = () => { setNote(''); setI((x) => x + 1) }
  const del = (side: 'links' | 'rechts') => {
    const p = side === 'links' ? pair.left : pair.right
    if (!window.confirm(`"${p.name}" (${side}) löschen? Nicht rückgängig.`)) return
    setNote(`Löschen (${side}) ist deaktiviert (read-only) — kommt mit der Hauptseiten-Anbindung (v2).`)
  }

  return (
    <div className="dash">
      <div className="dash-head">
        <div className="dup-head">
          <button onClick={onClose}>‹ zurück</button>
          <h2>Duplikate prüfen</h2>
          <span className="count">{done ? pairs.length : i + 1} / {pairs.length}</span>
        </div>
        {!done && (
          <p className="hint">
            Markiert = übereinstimmende Felder (machen es verdächtig): <strong>{matches}</strong> von {FIELDS.length}.
          </p>
        )}
      </div>

      {done ? (
        <p className="hint">Alle Paare durchgesehen. <button onClick={() => setI(0)}>Von vorn</button></p>
      ) : (
        <>
          <div className="dup-cols">
            {(['left', 'right'] as const).map((side) => {
              const p = side === 'left' ? pair.left : pair.right
              return (
                <div className="dup-card" key={side}>
                  <div className="dup-card-head">
                    <span className="dup-side">{side === 'left' ? 'LINKS (kanonisch)' : 'RECHTS (als Duplikat markiert)'}</span>
                    {p.image_url ? <img src={p.image_url} alt="" /> : <span className="noimg">—</span>}
                    <a href={`${SITE}/personalities/${p.slug}`} target="_blank" rel="noreferrer">{p.name}</a>
                  </div>
                  {FIELDS.map((f) => {
                    const a = norm(pair.left[f.key]); const b = norm(pair.right[f.key])
                    const match = a && a === b
                    return (
                      <div className={'dup-field' + (match ? ' match' : '')} key={String(f.key)}>
                        <span className="k">{f.label}</span>
                        <span className="v">{show(p[f.key], f.flag)}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {note && <div className="login-err">{note}</div>}

          <div className="dup-actions">
            <button className="btn-danger" onClick={() => del('links')}>Links löschen</button>
            <button className="btn-danger" onClick={() => del('rechts')}>Rechts löschen</button>
            <button onClick={next}>Überspringen ›</button>
            <button disabled title="soon">KI-Check</button>
          </div>
        </>
      )}
    </div>
  )
}
