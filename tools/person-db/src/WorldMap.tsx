import { useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography, type Geo } from 'react-simple-maps'
import isoCountries from 'i18n-iso-countries'
import worldData from 'world-atlas/countries-110m.json'
import type { Country } from './lib/query'
import { codeToFlag } from './lib/flags'

// count by ISO alpha-2 → fill. Monochrome-ish blue functional scale.
function fillFor(count: number, max: number): string {
  if (!count) return 'var(--panel)'
  const t = Math.sqrt(count / max) // compress long tail
  const a = 0.2 + 0.8 * t
  return `rgba(59, 130, 246, ${a.toFixed(2)})`
}

export function WorldMap({
  countries,
  counts,
}: {
  countries: Country[]
  counts: Record<string, number>
}) {
  const [tip, setTip] = useState<string>('')

  // ISO alpha-2 → person count
  const byAlpha2 = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of countries) {
      const n = counts[c.id]
      if (c.code && n) m[c.code.toUpperCase()] = n
    }
    return m
  }, [countries, counts])

  const max = useMemo(() => Math.max(1, ...Object.values(byAlpha2)), [byAlpha2])

  const tipFor = (a2: string, name: string): string => {
    const flag = a2 ? codeToFlag(a2) + ' ' : ''
    const persons = byAlpha2[a2] ?? 0
    return `${flag}${name} — ${persons.toLocaleString('de-DE')} Personen`
  }

  return (
    <section className="stat-card">
      <h3 className="ef-group">Weltkarte — Personen pro Land</h3>
      <p className="hint map-tip">{tip || 'Über ein Land fahren für Details.'}</p>
      <div className="worldmap">
        <ComposableMap projectionConfig={{ scale: 145 }} height={380} style={{ width: '100%', height: 'auto' }}>
          <Geographies geography={worldData}>
            {({ geographies }) =>
              geographies.map((geo: Geo) => {
                const a2 = isoCountries.numericToAlpha2(String(geo.id)) ?? ''
                const count = byAlpha2[a2] ?? 0
                const name = geo.properties?.name ?? a2
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => setTip(tipFor(a2, name))}
                    onMouseLeave={() => setTip('')}
                    style={{
                      default: { fill: fillFor(count, max), stroke: 'var(--border)', strokeWidth: 0.4, outline: 'none' },
                      hover: { fill: 'rgba(59,130,246,0.95)', stroke: 'var(--fg)', strokeWidth: 0.6, outline: 'none' },
                      pressed: { fill: 'rgba(59,130,246,0.95)', outline: 'none' },
                    }}
                  />
                )
              })
            }
          </Geographies>
        </ComposableMap>
      </div>
    </section>
  )
}
