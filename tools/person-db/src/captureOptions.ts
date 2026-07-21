import type { NewOption } from './NewMenu'

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
