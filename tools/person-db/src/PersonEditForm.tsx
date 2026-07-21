import { useState } from 'react'
import { READ_ONLY, ROLES_ENABLED } from './config'
import { milestonesForPerson } from './lib/milestones'
import { plausibilityCheck } from './lib/status'
import { StatusDot } from './StatusDot'
import { AiCheckPanel } from './AiCheckPanel'
import { MilestoneLinks } from './MilestoneLinks'
import {
  CAUSE_OF_DEATH_VALUES,
  REVIEW_STATUS_VALUES,
  VERIFICATION_STATUS_VALUES,
  VISIBILITY_VALUES,
  type Personality,
} from './types'
import { CityAutocomplete } from './CityAutocomplete'

// Editable copy of a personality. v1 = read-only preview of the edit mask:
// fields render + you can type, but Speichern is disabled until the admin-login
// path (v2) lands. Then wire onSave → supabase.update.
type Draft = Record<string, unknown>

function toDraft(p: Personality): Draft {
  return {
    name: p.name ?? '',
    slug: p.slug ?? '',
    pronouns: p.pronouns ?? '',
    profession: p.profession ?? '',
    roles: [...(p.roles ?? [])], // Tätigkeit(en) — Slugs, getrennt vom Beruf
    description: p.description ?? '',
    bio: p.bio ?? '',
    birth_date: p.birth_date ?? '',
    death_date: p.death_date ?? '',
    birth_place: p.birth_place ?? '',
    death_place: p.death_place ?? '',
    cause_of_death: p.cause_of_death ?? '',
    is_living: p.is_living ?? false,
    nationality: p.nationality ?? '',
    lgbti_connection: p.lgbti_connection ?? '',
    lgbti_details: p.lgbti_details ?? '',
    website_url: p.website_url ?? '',
    wikipedia_url: p.wikipedia_url ?? '',
    wikidata_qid: p.wikidata_qid ?? '',
    image_url: p.image_url ?? '',
    tags: (p.tags ?? []).join(', '),
    visibility: p.visibility ?? '',
    review_status: p.review_status ?? '',
    verification_status: p.verification_status ?? '',
    is_featured: p.is_featured ?? false,
    is_adult: p.is_adult ?? false,
  }
}

export function PersonEditForm({
  p,
  onClose,
}: {
  p: Personality
  onClose: () => void
}) {
  const [d, setD] = useState<Draft>(() => toDraft(p))
  const [delErr, setDelErr] = useState('')
  const [aiIssues, setAiIssues] = useState<string[] | null>(null)
  const [showAi, setShowAi] = useState(false)
  const [roleInput, setRoleInput] = useState('')
  const runQuickCheck = () => setAiIssues(plausibilityCheck(d))
  const upd = (k: string, v: unknown) => setD((prev) => ({ ...prev, [k]: v }))

  // Tätigkeit(en) — mehrwertige Slugs, getrennt vom Beruf.
  const roles = (d.roles as string[] | undefined) ?? []
  const addRole = () => {
    const slug = roleInput.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    setRoleInput('')
    if (!slug || roles.includes(slug)) return
    upd('roles', [...roles, slug])
  }
  const removeRole = (r: string) => upd('roles', roles.filter((x) => x !== r))

  // Deletion is only offered for an existing person, blocked while linked to a
  // milestone. The destructive DB write itself stays gated (read-only).
  const linkedMs = p.id ? milestonesForPerson(p.slug) : []
  const blocked = linkedMs.length > 0
  const onDelete = () => {
    if (blocked) return
    if (!window.confirm(`"${p.name}" endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return
    setDelErr('Löschen ist noch deaktiviert (read-only) — es kommt mit der Hauptseiten-Anbindung (v2).')
  }

  const Text = (k: string, label: string) => (
    <label className="ef">
      <span>{label}</span>
      <input value={String(d[k] ?? '')} onChange={(e) => upd(k, e.target.value)} />
    </label>
  )
  const Area = (k: string, label: string) => (
    <label className="ef ef-wide">
      <span>{label}</span>
      <textarea value={String(d[k] ?? '')} onChange={(e) => upd(k, e.target.value)} />
    </label>
  )
  const Select = (k: string, label: string, opts: string[]) => (
    <label className="ef">
      <span>{label}</span>
      <select value={String(d[k] ?? '')} onChange={(e) => upd(k, e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
  const Check = (k: string, label: string) => (
    <label className="ef ef-check">
      <input type="checkbox" checked={Boolean(d[k])} onChange={(e) => upd(k, e.target.checked)} />
      <span>{label}</span>
    </label>
  )

  return (
    <div className="detail edit">
      <div className="detail-top">
        <h2>
          {p.id && <StatusDot p={p} />}{p.id ? ` Bearbeiten — ${p.name}` : 'Neue Person erfassen'}
        </h2>
        <div className="detail-actions">
          <button
            className="check-btn"
            onClick={() => setShowAi((v) => !v)}
            title="Angaben von einer KI gegenprüfen lassen"
          >
            ✨ Mit KI prüfen
          </button>
          <button className="check-btn" onClick={runQuickCheck} title="Regelbasierter Schnellcheck (ohne KI)">
            Schnellcheck
          </button>
          <button className="check-btn" onClick={onClose}>‹ zurück</button>
        </div>
      </div>

      {showAi && <AiCheckPanel person={d} onClose={() => setShowAi(false)} />}

      {aiIssues !== null && (
        <div className="ai-result">
          <div className="ai-result-head">
            <strong>Schnellcheck</strong>
            <span className="hint">regelbasiert (ohne KI)</span>
            <button className="ai-x" onClick={() => setAiIssues(null)}>×</button>
          </div>
          {aiIssues.length === 0 ? (
            <p className="ai-ok">✓ Keine Auffälligkeiten gefunden.</p>
          ) : (
            <ul className="ai-list">
              {aiIssues.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          )}
        </div>
      )}

      {typeof d.image_url === 'string' && d.image_url && (
        <img className="hero" src={String(d.image_url)} alt="Vorschau" />
      )}

      {READ_ONLY && (
        <div className="edit-banner">
          Vorschau der Bearbeitungsmaske. <strong>Speichern ist deaktiviert</strong> —
          Schreiben kommt später über die Hauptseiten-Anbindung. Änderungen hier haben
          keinen Effekt.
        </div>
      )}

      <h3 className="ef-group">Basis</h3>
      {Text('name', 'Name')}
      {Text('slug', 'Slug')}
      {Text('pronouns', 'Pronomen')}
      {Text('profession', 'Beruf')}
      {ROLES_ENABLED && (
        <label className="ef ef-wide">
          <span>Tätigkeit(en)</span>
          <div className="roles-edit">
            {roles.length > 0 && (
              <div className="tagrow">
                {roles.map((r) => (
                  <span className="tag" key={r}>
                    {r}
                    <button onClick={() => removeRole(r)} title="entfernen">×</button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addRole() }
              }}
              placeholder="Tätigkeit + Enter (z. B. activist) — getrennt vom Beruf"
            />
          </div>
        </label>
      )}
      {Area('description', 'Beschreibung')}
      {Area('bio', 'Bio')}

      <h3 className="ef-group">Details</h3>
      {Text('birth_date', 'Geburtsdatum (YYYY-MM-DD)')}
      <label className="ef" htmlFor="pef-birth-place">
        <span>Geburtsort</span>
        <CityAutocomplete id="pef-birth-place" value={String(d.birth_place ?? '')} onChange={(v) => upd('birth_place', v)} placeholder="Stadt suchen (queer.guide)…" withCountry />
      </label>
      {Text('death_date', 'Todesdatum (YYYY-MM-DD)')}
      <label className="ef" htmlFor="pef-death-place">
        <span>Todesort</span>
        <CityAutocomplete id="pef-death-place" value={String(d.death_place ?? '')} onChange={(v) => upd('death_place', v)} placeholder="Stadt suchen (queer.guide)…" withCountry />
      </label>
      {Select('cause_of_death', 'Todesursache', CAUSE_OF_DEATH_VALUES)}
      {Check('is_living', 'Lebt')}
      {Text('nationality', 'Nationalität')}

      <h3 className="ef-group">LGBTQ+ / Meilenstein</h3>
      {Area('lgbti_connection', 'LGBTI-Bezug')}
      {Area('lgbti_details', 'LGBTI-Details')}
      {p.id ? (
        <MilestoneLinks p={p} />
      ) : (
        <p className="hint">Meilensteine verknüpfen: erst die Person anlegen, dann per Auswahl.</p>
      )}

      <h3 className="ef-group">Links & Medien</h3>
      {Text('website_url', 'Website')}
      {Text('wikipedia_url', 'Wikipedia')}
      {Text('wikidata_qid', 'Wikidata QID')}
      {Text('image_url', 'Bild-URL')}
      {Text('tags', 'Tags (Komma-getrennt)')}

      <h3 className="ef-group">Status</h3>
      {Select('visibility', 'Sichtbarkeit', VISIBILITY_VALUES)}
      {Select('review_status', 'Review-Status', REVIEW_STATUS_VALUES)}
      {Select('verification_status', 'Verifizierung', VERIFICATION_STATUS_VALUES)}
      {Check('is_featured', 'Featured')}
      {Check('is_adult', 'Adult')}

      {p.id && blocked && (
        <div className="edit-banner">
          <strong>Löschen nicht möglich</strong> — verknüpft mit {linkedMs.length}{' '}
          Meilenstein{linkedMs.length > 1 ? 'en' : ''}: {linkedMs.map((m) => m.title).join(', ')}.
          Erst die Verknüpfung(en) lösen.
        </div>
      )}
      {delErr && <div className="login-err">{delErr}</div>}
      <div className="edit-actions">
        {p.id && (
          <button
            className="btn-danger"
            disabled={blocked}
            onClick={onDelete}
            title={blocked ? 'Erst Milestone-Verknüpfungen lösen' : 'Person löschen'}
          >
            Person löschen
          </button>
        )}
        <span className="spacer" />
        <button onClick={onClose}>Abbrechen</button>
        <button className="primary" disabled title="Schreiben folgt über Hauptseite">
          Speichern
        </button>
      </div>
    </div>
  )
}
