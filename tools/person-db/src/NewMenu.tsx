import { useEffect, useRef, useState } from 'react'

export interface NewOption {
  label: string
  onClick?: () => void
  disabled?: boolean
  hint?: string
}

// "New ▾" button — opens a menu of capture methods (manuell / Foto / Link / …).
export function NewMenu({ options, align = 'right' }: { options: NewOption[]; align?: 'left' | 'right' }) {
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
    <div className="newmenu" ref={ref}>
      <button className="primary" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        New ▾
      </button>
      {open && (
        <div className={'newmenu-list ' + align} role="menu">
          {options.map((o) => (
            <button
              key={o.label}
              role="menuitem"
              className="kebab-item"
              disabled={o.disabled}
              onClick={() => {
                setOpen(false)
                o.onClick?.()
              }}
            >
              <span>{o.label}</span>
              {o.hint && <span className="kebab-hint">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// The shared capture-method set. onManual always wired; onPhoto optional.
export function captureOptions(h: { onManual: () => void; onPhoto?: () => void }): NewOption[] {
  return [
    { label: 'Manuell erfassen', onClick: h.onManual },
    h.onPhoto
      ? { label: 'Foto-Upload', onClick: h.onPhoto }
      : { label: 'Foto-Upload', disabled: true, hint: 'soon' },
    { label: 'Link-Import', disabled: true, hint: 'soon' },
    { label: 'Listen-Import (CSV)', disabled: true, hint: 'soon' },
  ]
}
