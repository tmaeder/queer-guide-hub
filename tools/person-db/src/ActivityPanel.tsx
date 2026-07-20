import { useEffect, useState } from 'react'
import { fetchAttentionPersons, fetchPersonById, fetchRecentPersons } from './lib/query'
import { withFlag } from './lib/flags'
import type { Personality } from './types'
import { PersonEditForm } from './PersonEditForm'
import { StatusDot } from './StatusDot'

function List({
  title,
  rows,
  dateKey,
  onOpen,
}: {
  title: string
  rows: Personality[]
  dateKey: 'created_at' | 'updated_at'
  onOpen: (id: string) => void
}) {
  return (
    <section className="stat-card">
      <h3 className="ef-group">{title}</h3>
      {rows.length === 0 && <p className="hint">—</p>}
      {rows.map((p) => (
        <button className="act-row" key={p.id} onClick={() => onOpen(p.id)} title="Bearbeiten">
          {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="noimg">—</span>}
          <span className="meta">
            <span className="name"><StatusDot p={p} /> {p.name}</span>
            <span className="sub">
              {[p.profession, withFlag(p.nationality)].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="act-date">{(p[dateKey] as string)?.slice(0, 10)}</span>
        </button>
      ))}
    </section>
  )
}

export function ActivityPanel() {
  const [recent, setRecent] = useState<Personality[]>([])
  const [attention, setAttention] = useState<Personality[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Personality | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchRecentPersons(6), fetchAttentionPersons(6)])
      .then(([r, a]) => {
        if (!alive) return
        setRecent(r)
        setAttention(a)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const openEdit = async (id: string) => {
    try {
      const p = await fetchPersonById(id)
      if (p) setEditing(p)
    } catch {
      /* ignore */
    }
  }

  if (editing) {
    return (
      <div className="activity-edit">
        <PersonEditForm p={editing} onClose={() => setEditing(null)} />
      </div>
    )
  }

  if (loading) return <p className="hint">Aktivität lädt…</p>

  return (
    <div className="stats-grid activity">
      <List title="Neu aufgenommen" rows={recent} dateKey="created_at" onOpen={openEdit} />
      <List title="Zu bearbeiten (needs attention)" rows={attention} dateKey="updated_at" onOpen={openEdit} />
    </div>
  )
}
