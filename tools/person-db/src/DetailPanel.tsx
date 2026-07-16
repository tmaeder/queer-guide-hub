import { useEffect, useState } from 'react'
import type { Personality } from './types'
import { getEntry, saveEntry } from './lib/notes'
import {
  getMilestones,
  linkPersonToMilestone,
  milestonesForPerson,
  unlinkPersonFromMilestone,
  type Milestone,
} from './lib/milestones'
import { PersonEditForm } from './PersonEditForm'
import { KebabMenu } from './KebabMenu'
import { personDatasheet } from './lib/pdf'
import { withFlag } from './lib/flags'
import { StatusDot } from './StatusDot'
import { ROLES_ENABLED } from './config'

const SITE = 'https://queer.guide'

// Person-side milestone linking.
function MilestoneLinks({ p }: { p: Personality }) {
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
      <p className="hint">Lokal. Verknüpft diese Person mit einem Meilenstein.</p>
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

function Field({ k, v, href }: { k: string; v: unknown; href?: string }) {
  let display: string
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
    return (
      <div className="field">
        <span className="k">{k}</span>
        <span className="v missing">—</span>
      </div>
    )
  }
  if (Array.isArray(v)) display = v.join(', ')
  else if (typeof v === 'object') display = JSON.stringify(v, null, 2)
  else display = String(v)

  return (
    <div className="field">
      <span className="k">{k}</span>
      <span className="v">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {display}
          </a>
        ) : (
          display
        )}
      </span>
    </div>
  )
}

interface DetailProps {
  p: Personality | null
  isChecked: boolean
  onToggleChecked: () => void
  onLocalChange: () => void
}

export function DetailPanel({ p, isChecked, onToggleChecked, onLocalChange }: DetailProps) {
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [savedAt, setSavedAt] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!p) return
    const e = getEntry(p.id)
    setNote(e.note)
    setTags(e.tags)
    setTagInput('')
    setSavedAt('')
    setEditing(false) // leave edit mask when switching person
  }, [p?.id])

  if (!p) {
    return (
      <div className="detail">
        <div className="empty">Person links wählen.</div>
      </div>
    )
  }

  if (editing) {
    return <PersonEditForm p={p} onClose={() => setEditing(false)} />
  }

  const persist = (nextNote: string, nextTags: string[]) => {
    const e = saveEntry(p.id, { note: nextNote, tags: nextTags })
    setSavedAt(new Date(e.updated_at).toLocaleTimeString())
    onLocalChange()
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (!t || tags.includes(t)) return
    const next = [...tags, t]
    setTags(next)
    setTagInput('')
    persist(note, next)
  }

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t)
    setTags(next)
    persist(note, next)
  }

  return (
    <div className="detail">
      {p.image_url && <img className="hero" src={p.image_url} alt={p.name} />}
      <div className="detail-top">
        <div>
          <h2><StatusDot p={p} /> {p.name}</h2>
          <p className="prof">
            {p.profession || 'Beruf unbekannt'}
            {p.pronouns ? ` · ${p.pronouns}` : ''}
          </p>
        </div>
        <div className="detail-actions">
          {isChecked && <span className="checked-tag" title="locally checked">✓ checked</span>}
          <KebabMenu
            items={[
              { label: 'Edit', onClick: () => setEditing(true) },
              { label: 'PDF', onClick: () => personDatasheet(p) },
              { label: 'Send to…', disabled: true, hint: 'soon' },
              {
                label: isChecked ? 'Unmark checked' : 'Mark checked',
                onClick: onToggleChecked,
              },
              { label: 'Check via AI', disabled: true, hint: 'soon' },
            ]}
          />
        </div>
      </div>

      <Field k="Slug" v={p.slug} href={`${SITE}/personalities/${p.slug}`} />
      <Field k="Sichtbarkeit" v={p.visibility} />
      <Field k="Review-Status" v={p.review_status} />
      <Field k="Verifizierung" v={p.verification_status} />
      <Field k="Needs attention" v={p.needs_attention ? 'JA' : 'nein'} />
      <Field k="Featured" v={p.is_featured ? 'ja' : 'nein'} />
      <Field k="Adult" v={p.is_adult ? 'ja' : 'nein'} />

      <Field k="Geburtsdatum" v={p.birth_date} />
      <Field k="Geburtsort" v={p.birth_place} />
      <Field k="Todesdatum" v={p.death_date} />
      <Field k="Todesort" v={p.death_place} />
      <Field k="Todesursache" v={p.cause_of_death} />
      <Field k="Lebt" v={p.is_living == null ? null : p.is_living ? 'ja' : 'nein'} />
      <Field k="Nationalität" v={withFlag(p.nationality)} />
      {ROLES_ENABLED && <Field k="Tätigkeit(en)" v={p.roles} />}

      <Field k="Beschreibung" v={p.description} />
      <Field k="Bio" v={p.bio} />
      <Field k="LGBTI-Bezug" v={p.lgbti_connection} />
      <Field k="LGBTI-Details" v={p.lgbti_details} />
      <Field k="Meilenstein" v={p.milestone} />
      <Field k="Tags (DB)" v={p.tags} />
      <Field k="Achievements" v={p.achievements} />

      <Field k="Website" v={p.website_url} href={p.website_url ?? undefined} />
      <Field k="Wikipedia" v={p.wikipedia_url} href={p.wikipedia_url ?? undefined} />
      <Field
        k="Wikidata"
        v={p.wikidata_qid}
        href={p.wikidata_qid ? `https://www.wikidata.org/wiki/${p.wikidata_qid}` : undefined}
      />
      <Field k="Social" v={p.social_links} />

      <Field k="Quality" v={p.quality_score} />
      <Field k="Trust" v={p.trust_score} />
      <Field k="Completeness" v={p.completeness_score} />
      <Field k="Views" v={p.view_count} />
      <Field k="Erstellt" v={p.created_at?.slice(0, 10)} />
      <Field k="Aktualisiert" v={p.updated_at?.slice(0, 10)} />

      <MilestoneLinks p={p} />

      <div className="notes">
        <h3>
          Notizen &amp; Tags
          {savedAt && <span className="saved">gespeichert {savedAt}</span>}
        </h3>
        <p className="hint">Nur lokal in diesem Browser. Kein Effekt auf Live-Seite.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => persist(note, tags)}
          placeholder="Eigene Notiz…"
        />
        <div className="tagrow">
          {tags.map((t) => (
            <span className="tag" key={t}>
              {t}
              <button onClick={() => removeTag(t)} title="entfernen">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="tagrow">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Tag + Enter"
            style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }}
          />
        </div>
      </div>
    </div>
  )
}
