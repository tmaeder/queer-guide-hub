import { READ_ONLY } from './config'
import { ThemeToggle } from './ThemeToggle'

export type View = 'dashboard' | 'list' | 'upcoming' | 'liste' | 'milestone' | 'duplicates'

// Top navigation. Add entries here to grow the bar later.
// `view` values Home + Upcoming exist now; more buttons slot in as needed.
interface NavItem {
  key: View
  label: string
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Home' },
  { key: 'liste', label: 'Liste' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'milestone', label: 'Milestone' },
]

export function NavBar({
  active,
  onNavigate,
}: {
  active: View
  onNavigate: (v: View) => void
}) {
  // The list view has no own nav button; Home covers "back".
  const isActive = (k: View) =>
    k === active || (k === 'dashboard' && active === 'list')

  return (
    <nav className="nav">
      <span className="nav-brand">Person-DB</span>
      <div className="nav-items">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={'nav-btn' + (isActive(n.key) ? ' active' : '')}
            onClick={() => onNavigate(n.key)}
          >
            {n.label}
          </button>
        ))}
        {/* Platz für weitere Buttons */}
      </div>
      <div className="nav-right">
        <ThemeToggle />
        {READ_ONLY && <span className="badge-ro">read-only</span>}
      </div>
    </nav>
  )
}
