import { PAGE_SIZE_OPTIONS } from './config'

// Shared "Anzeigen: 25 / 50 / 100" control (Liste + Upcoming).
export function PageSizer({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <label className="chk pagesizer">
      Anzeigen
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  )
}
