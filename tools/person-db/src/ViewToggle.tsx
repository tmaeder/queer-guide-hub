export type Layout = 'split' | 'list'

// Segmented toggle: geteilte Ansicht (Liste + Detail) ↔ ausführliche Liste.
export function ViewToggle({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  return (
    <div className="seg">
      <button className={value === 'split' ? 'on' : ''} onClick={() => onChange('split')}>
        Geteilt
      </button>
      <button className={value === 'list' ? 'on' : ''} onClick={() => onChange('list')}>
        Liste
      </button>
    </div>
  )
}
