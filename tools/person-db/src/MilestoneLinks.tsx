import { useEffect, useState } from 'react'
import type { Personality } from './types'
import {
  getMilestones,
  linkPersonToMilestone,
  milestonesForPerson,
  unlinkPersonFromMilestone,
  type Milestone,
} from './lib/milestones'

// Person-side milestone linking — SELECTION ONLY. Milestones are chosen from the
// existing list (dropdown); no free-text milestone entry. New milestones are
// created only in the milestone manager, then appear here. Used in the detail
// view and the edit mask.
export function MilestoneLinks({ p }: { p: Personality }) {
  const [links, setLinks] = useState<Milestone[]>(() => milestonesForPerson(p.slug))
  const [pick, setPick] = useState('')
  useEffect(() => setLinks(milestonesForPerson(p.slug)), [p.slug])

  const refresh = () => setLinks(milestonesForPerson(p.slug))
  const linkedIds = new Set(links.map((m) => m.id))
  const options = getMilestones().filter((m) => !linkedIds.has(m.id))

  const add = (id: string) => {
    if (!id) return
    linkPersonToMilestone(id, { slug: p.slug, name: p.name })
    setPick('')
    refresh()
  }

  return (
    <div className="notes">
      <h3>Verknüpfte Meilensteine</h3>
      <p className="hint">Nur per Auswahl verknüpfbar. Neue Meilensteine in der Meilenstein-Verwaltung anlegen.</p>
      {links.length === 0 && <p className="hint">— noch keine —</p>}
      {links.map((m) => {
        const role = m.linked_persons.find((x) => x.slug === p.slug)?.role
        return (
          <div className="mlink-row" key={m.id}>
            <span className="mlink-date">{m.date}</span>
            <span className="mlink-title">
              {m.title}
              {role && <span className="muted"> — {role}</span>}
            </span>
            <button
              className="mlink-x"
              title="Verknüpfung lösen"
              onClick={() => { unlinkPersonFromMilestone(m.id, p.slug); refresh() }}
            >
              ×
            </button>
          </div>
        )
      })}
      <select className="mlink-add" value={pick} onChange={(e) => add(e.target.value)}>
        <option value="">+ Mit Meilenstein verknüpfen…</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>{m.date} · {m.title}</option>
        ))}
      </select>
    </div>
  )
}
