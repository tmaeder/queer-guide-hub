import { useState } from 'react'
import type { Personality } from './types'
import { assessQuality, provenanceLabel } from './lib/quality'

// Datenqualitäts-Ampel für die Detailseite. Zeigt eine Freigabe-Ampel
// (rot/gelb/grün/blau) + drei Dimensions-Chips (Prüftiefe, Herkunft,
// Vollständigkeit). Details klappen auf Klick auf.
export function QualityAmpel({ p, localChecked }: { p: Personality; localChecked: boolean }) {
  const [open, setOpen] = useState(false)
  const q = assessQuality(p, localChecked)

  return (
    <div className={`ampel ampel-${q.tier}`}>
      <button
        type="button"
        className="ampel-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="ampel-dot" aria-hidden />
        <span className="ampel-label">Datenqualität: {q.label}</span>
        <span className="ampel-toggle" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      <div className="qa-chips">
        <span className="qa-chip" title="Zwei unabhängige DB-Stempel: Review + Verifizierung">
          Prüftiefe{' '}
          <b className="qa-stamps" aria-label={`${(q.stamps.review ? 1 : 0) + (q.stamps.verification ? 1 : 0)} von 2`}>
            <i className={q.stamps.review ? 'on' : ''} />
            <i className={q.stamps.verification ? 'on' : ''} />
          </b>
        </span>
        <span className="qa-chip" title="Heuristik aus Wikidata-ID + Beleg-Quelle — Schätzung">
          {provenanceLabel(q.provenance)}
        </span>
        <span
          className={'qa-chip' + (q.completeness.missing.length ? ' warn' : '')}
          title={q.completeness.missing.length ? `Fehlt: ${q.completeness.missing.join(', ')}` : 'Alle Kernfelder vorhanden'}
        >
          Vollständig {q.completeness.have}/{q.completeness.total}
        </span>
        {q.localChecked && (
          <span className="qa-chip local" title="Nur in diesem Browser als geprüft markiert — kein DB-Signal">
            ✓ von mir geprüft
          </span>
        )}
      </div>

      {open && (
        <div className="qa-detail">
          {q.reasons.length > 0 && (
            <ul className="qa-reasons">
              {q.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <div className="qa-fields">
            {q.completeness.fields.map((f) => (
              <span key={f.key} className={'qa-field' + (f.present ? ' ok' : ' miss')}>
                {f.present ? '✓' : '—'} {f.label}
              </span>
            ))}
          </div>
          <p className="qa-note">
            Ampel = Anzeige, keine Freigabe. Rot/Gelb bleiben trotz Anzeige öffentlich,
            solange kein Sichtbarkeits-Gate greift.
          </p>
        </div>
      )}
    </div>
  )
}
