import { useEffect, useMemo, useState } from 'react'
import { errMsg } from './lib/errMsg'
import type { Personality } from './types'
import { fetchForQuality, fetchPersonById } from './lib/query'
import { assessQuality, provenanceLabel, type QualityTier, type Provenance } from './lib/quality'
import { DetailPanel } from './DetailPanel'
import { checkedIds, toggleChecked, annotatedIds } from './lib/notes'

type Scope = 'public' | 'live'

const TIERS: { key: QualityTier; label: string }[] = [
  { key: 'red', label: 'Nicht freigabereif' },
  { key: 'yellow', label: 'Ungeprüft' },
  { key: 'green', label: 'Geprüft' },
  { key: 'blue', label: 'Doppelt bestätigt' },
]

const PROVS: Provenance[] = ['auto', 'manual', 'mixed', 'unknown']

// Qualitäts-Dashboard: Ampel-Verteilung über alle Zeilen im Scope + Arbeitsliste.
// Macht aus der Einzel-Ampel einen abarbeitbaren Betrieb (rot → grün).
export function QualityDashboard() {
  const [scope, setScope] = useState<Scope>('public')
  const [rows, setRows] = useState<Personality[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTier, setActiveTier] = useState<QualityTier>('red')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<Personality | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [annotated, setAnnotated] = useState<Set<string>>(new Set())

  const refreshLocal = () => { setChecked(checkedIds()); setAnnotated(annotatedIds()) }

  useEffect(() => {
    let alive = true
    // Intentional synchronous reset when the scope changes: clear the prior
    // scope's selection/error and show the loading state before refetching.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true)
    setError('')
    setSelectedId(null)
    setSelectedPerson(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchForQuality(scope)
      .then((r) => { if (alive) { setRows(r); refreshLocal() } })
      .catch((e) => { if (alive) setError(errMsg(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope])

  // Ampel-Bewertung pro Zeile (memoisiert; lokaler „checked" fließt nicht in die
  // DB-Stufe ein, nur die Detailanzeige nutzt ihn).
  const assessed = useMemo(
    () => rows.map((p) => ({ p, q: assessQuality(p) })),
    [rows],
  )

  const stats = useMemo(() => {
    const tier: Record<QualityTier, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
    const prov: Record<Provenance, number> = { auto: 0, manual: 0, mixed: 0, unknown: 0 }
    let completeSum = 0
    for (const { q } of assessed) {
      tier[q.tier]++
      prov[q.provenance]++
      completeSum += q.completeness.have / q.completeness.total
    }
    return { tier, prov, avgComplete: assessed.length ? completeSum / assessed.length : 0 }
  }, [assessed])

  const total = assessed.length
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  const listed = useMemo(
    () => assessed.filter((a) => a.q.tier === activeTier),
    [assessed, activeTier],
  )

  const selectRow = async (id: string) => {
    setSelectedId(id)
    setSelectedPerson(null)
    try { setSelectedPerson(await fetchPersonById(id)) } catch { /* ignore */ }
  }

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>Datenqualität — Übersicht</h2>
        <p className="hint">
          Ampel-Verteilung über {scope === 'public' ? 'öffentliche' : 'alle lebenden'} Personen.
          {loading && ' · lädt…'}
          {error && <span className="err"> · Fehler: {error}</span>}
        </p>
      </div>

      <div className="liste-filters">
        <div className="qd-scope">
          <button className={scope === 'public' ? 'on' : ''} onClick={() => setScope('public')}>Öffentlich</button>
          <button className={scope === 'live' ? 'on' : ''} onClick={() => setScope('live')}>Alle live</button>
        </div>
        <span className="count">{total.toLocaleString('de-DE')} Personen · Ø vollständig {Math.round(stats.avgComplete * 100)}%</span>
      </div>

      <div className="qd-cards">
        {TIERS.map((t) => (
          <button
            key={t.key}
            className={`qd-card ampel-${t.key}` + (activeTier === t.key ? ' on' : '')}
            onClick={() => setActiveTier(t.key)}
          >
            <span className="qd-dot" aria-hidden />
            <span className="qd-num">{stats.tier[t.key].toLocaleString('de-DE')}</span>
            <span className="qd-pct">{pct(stats.tier[t.key])}%</span>
            <span className="qd-lbl">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="qd-prov">
        Herkunft:
        {PROVS.map((pr) => (
          <span key={pr} className="qd-prov-item">{provenanceLabel(pr)} <b>{stats.prov[pr]}</b></span>
        ))}
      </div>

      <div className="body">
        <div className="list">
          <div className="qd-listhead">
            {TIERS.find((t) => t.key === activeTier)?.label}: {listed.length.toLocaleString('de-DE')}
          </div>
          {!loading && listed.length === 0 && <p className="hint">Keine in dieser Stufe.</p>}
          {listed.slice(0, 300).map(({ p, q }) => (
            <div
              key={p.id}
              className={'row' + (selectedId === p.id ? ' sel' : '')}
              role="button"
              tabIndex={0}
              onClick={() => selectRow(p.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRow(p.id) } }}
            >
              {checked.has(p.id) && <span className="check" title="lokal geprüft">✓</span>}
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="noimg">—</span>}
              <div className="meta">
                <div className="name">
                  {annotated.has(p.id) && <span className="dot" title="lokale Notiz" />}{' '}
                  {p.name}
                  {p.visibility !== 'public' && <span className="pill">{p.visibility}</span>}
                </div>
                <div className="sub">{[p.profession, q.reasons[0]].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
          {listed.length > 300 && <p className="hint">… {listed.length - 300} weitere (Liste auf 300 begrenzt).</p>}
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
