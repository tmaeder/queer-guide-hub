import { useEffect, useMemo, useState } from 'react'
import { errMsg } from './lib/errMsg'
import {
  fetchCohortCounts,
  fetchCountries,
  fetchCountryCounts,
  type Country,
} from './lib/query'
import { codeToFlag } from './lib/flags'
import { WorldMap } from './WorldMap'

interface Bar {
  label: string
  value: number
  flag?: string
}

function BarList({ bars, max }: { bars: Bar[]; max: number }) {
  return (
    <div className="bars">
      {bars.map((b) => (
        <div className="bar-row" key={b.label}>
          <span className="bar-label">
            {b.flag ? b.flag + ' ' : ''}
            {b.label}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${max ? (b.value / max) * 100 : 0}%` }} />
          </span>
          <span className="bar-val">{b.value.toLocaleString('de-DE')}</span>
        </div>
      ))}
    </div>
  )
}

export function HomeStats() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusBars, setStatusBars] = useState<Bar[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [showMissing, setShowMissing] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cohorts, cs, cc] = await Promise.all([
          fetchCohortCounts(['public', 'draft', 'needs_attention', 'review_pending', 'no_image', 'no_text']),
          fetchCountries(),
          fetchCountryCounts(),
        ])
        if (!alive) return
        setStatusBars([
          { label: 'Öffentlich', value: cohorts.public ?? 0 },
          { label: 'Entwürfe', value: cohorts.draft ?? 0 },
          { label: 'Review offen', value: cohorts.review_pending ?? 0 },
          { label: 'Needs attention', value: cohorts.needs_attention ?? 0 },
          { label: 'Kein Bild', value: cohorts.no_image ?? 0 },
          { label: 'Kein Text', value: cohorts.no_text ?? 0 },
        ])
        setCountries(cs)
        setCounts(cc)
      } catch (e) {
        if (alive) setError(errMsg(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, Country>()
    for (const c of countries) m.set(c.id, c)
    return m
  }, [countries])

  const topCountries: Bar[] = useMemo(() => {
    return Object.entries(counts)
      .map(([id, value]) => {
        const c = byId.get(id)
        return {
          label: c?.name ?? 'unbekannt',
          value,
          flag: c?.code ? codeToFlag(c.code) : '',
        }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)
  }, [counts, byId])

  const represented = Object.keys(counts).length
  const total = countries.length
  const missing = useMemo(
    () =>
      countries
        .filter((c) => !counts[c.id])
        .map((c) => ({ ...c, flag: c.code ? codeToFlag(c.code) : '' })),
    [countries, counts],
  )

  const statusMax = Math.max(1, ...statusBars.map((b) => b.value))
  const topMax = Math.max(1, ...topCountries.map((b) => b.value))

  if (loading) return <p className="hint">Statistik lädt…</p>
  if (error) return <p className="hint err">Statistik-Fehler: {error}</p>

  return (
    <div className="stats">
      <div className="stats-grid">
        <section className="stat-card">
          <h3 className="ef-group">Personen nach Status</h3>
          <BarList bars={statusBars} max={statusMax} />
        </section>

        <section className="stat-card">
          <h3 className="ef-group">Top-Länder</h3>
          <BarList bars={topCountries} max={topMax} />
        </section>
      </div>

      <section className="stat-card">
        <h3 className="ef-group">Länder-Abdeckung</h3>
        <p className="hint">
          <strong>{represented}</strong> von <strong>{total}</strong> Ländern vertreten
          {' '}({total ? Math.round((represented / total) * 100) : 0} %).
        </p>
        <span className="bar-track big">
          <span className="bar-fill" style={{ width: `${total ? (represented / total) * 100 : 0}%` }} />
        </span>
        <button className="mt" onClick={() => setShowMissing((s) => !s)}>
          {showMissing ? 'Fehlende ausblenden' : `${missing.length} fehlende Länder zeigen`}
        </button>
        {showMissing && (
          <div className="missing-list">
            {missing.map((c) => (
              <span className="tag" key={c.id}>
                {c.flag ? c.flag + ' ' : ''}
                {c.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <WorldMap countries={countries} counts={counts} />
    </div>
  )
}
