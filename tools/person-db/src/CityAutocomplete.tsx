import { useEffect, useRef, useState } from 'react'
import { searchCities, type CityHit } from './lib/query'
import { codeToFlag } from './lib/flags'

// City picker against the queer.guide cities table. Free text still allowed
// (typing sets the value directly); picking a suggestion formats it.
export function CityAutocomplete({
  value,
  onChange,
  placeholder,
  withCountry = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  withCountry?: boolean
}) {
  const [results, setResults] = useState<CityHit[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<number | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const onType = (v: string) => {
    onChange(v)
    clearTimeout(debounce.current)
    if (!v.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    debounce.current = window.setTimeout(() => {
      searchCities(v)
        .then((r) => {
          setResults(r)
          setOpen(r.length > 0)
        })
        .catch(() => setResults([]))
    }, 250)
  }

  const pick = (c: CityHit) => {
    onChange(withCountry && c.country ? `${c.name}, ${c.country}` : c.name)
    setOpen(false)
    setResults([])
  }

  return (
    <div className="city-ac" ref={ref}>
      <input
        type="text"
        value={value}
        placeholder={placeholder ?? 'Stadt suchen…'}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && (
        <div className="city-results">
          {results.map((c) => (
            <button key={c.id} className="city-result" onClick={() => pick(c)}>
              {c.code ? codeToFlag(c.code) + ' ' : ''}
              {c.name}
              {c.country && <span className="muted"> · {c.country}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
