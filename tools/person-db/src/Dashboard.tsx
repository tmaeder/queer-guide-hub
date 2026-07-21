import { useEffect, useState } from 'react'
import { COHORTS, type Cohort } from './types'
import { fetchCohortCounts, type CohortCounts } from './lib/query'
import { checkedIds } from './lib/notes'
import { HomeStats } from './HomeStats'
import { ActivityPanel } from './ActivityPanel'

const fmt = (n: number | undefined) =>
  n == null ? '…' : n.toLocaleString('de-DE')

export function Dashboard({ onPick }: { onPick: (c: Cohort) => void }) {
  const [counts, setCounts] = useState<CohortCounts>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checked] = useState(() => checkedIds().size)

  useEffect(() => {
    fetchCohortCounts(COHORTS.map((c) => c.key))
      .then(setCounts)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>Personen-Check</h2>
        <p className="hint">
          Kohorte wählen → Liste durcharbeiten → mit <kbd>c</kbd> als geprüft
          markieren. Prüf-Status ist lokal (nur dieser Browser).
        </p>
        <p className="hint status-legend">
          <span className="status-dot green" /> online ·
          <span className="status-dot yellow" /> zu bearbeiten ·
          <span className="status-dot red" /> geblockt
        </p>
        <p className="hint">
          Lokal als geprüft markiert: <strong>{checked.toLocaleString('de-DE')}</strong>
          {loading && ' · Zahlen laden…'}
          {error && <span className="err"> · Fehler: {error}</span>}
        </p>
      </div>

      <ActivityPanel />

      <div className="tiles">
        {COHORTS.map((c) => (
          <button key={c.key} className="tile" onClick={() => onPick(c.key)}>
            <span className="tile-n">{fmt(counts[c.key])}</span>
            <span className="tile-l">{c.label}</span>
            <span className="tile-h">{c.hint}</span>
          </button>
        ))}
      </div>

      <HomeStats />
    </div>
  )
}
