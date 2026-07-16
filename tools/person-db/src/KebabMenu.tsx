import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  hint?: string // small trailing note, e.g. "soon"
}

// Three-dots (⋯) menu. Closes on outside click / Escape.
export function KebabMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="kebab" ref={ref}>
      <button
        className="kebab-btn"
        onClick={() => setOpen((o) => !o)}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="kebab-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className="kebab-item"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onClick?.()
              }}
            >
              <span>{it.label}</span>
              {it.hint && <span className="kebab-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
