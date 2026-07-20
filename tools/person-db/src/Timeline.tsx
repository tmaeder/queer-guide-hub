import type { Milestone } from './lib/milestones'
import { withFlag } from './lib/flags'

const impactClass: Record<Milestone['impact'], string> = {
  positive: 'imp-pos',
  neutral: 'imp-neu',
  negative: 'imp-neg',
}

// Chronological vertical timeline of milestones.
export function Timeline({
  items,
  onOpen,
}: {
  items: Milestone[]
  onOpen: (id: string) => void
}) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))

  if (!sorted.length) return <p className="hint">Noch keine Milestones.</p>

  return (
    <div className="timeline">
      {sorted.map((m) => (
        <button key={m.id} className="tl-item" onClick={() => onOpen(m.id)}>
          <span className={'tl-dot ' + impactClass[m.impact]} />
          <span className="tl-year">{m.date.slice(0, 4)}</span>
          <span className="tl-body">
            <span className="tl-title">
              {m.title}
              <span className="tl-stars">{'★'.repeat(m.significance)}</span>
            </span>
            <span className="tl-meta">
              {[
                [m.date, m.date_end].filter(Boolean).join(' – '),
                [m.city, withFlag(m.country)].filter(Boolean).join(' · '),
              ]
                .filter(Boolean)
                .join('  ·  ')}
              {m.checked ? '  ·  ✓ geprüft' : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
