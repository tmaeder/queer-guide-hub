import { jsPDF } from 'jspdf'
import type { Personality } from '../types'
import { IMPACT_LABEL, type Milestone } from './milestones'

const SITE = 'https://queer.guide'

// Basic person datasheet PDF. v1 = simple text layout.
// The "Datenblatt" design (logo, sections, image) comes later.
export function personDatasheet(p: Personality) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 48
  const width = doc.internal.pageSize.getWidth()
  let y = margin

  const line = (text: string, size = 10, bold = false, gap = 4) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const wrapped = doc.splitTextToSize(text, width - margin * 2)
    for (const l of wrapped) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(l, margin, y)
      y += size + gap
    }
  }

  const field = (label: string, value: unknown) => {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return
    const v = Array.isArray(value) ? value.join(', ') : String(value)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    const wrapped = doc.splitTextToSize(v, width - margin * 2 - 120)
    for (let i = 0; i < wrapped.length; i++) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(wrapped[i], margin + 120, y)
      y += 13
    }
    y += 3
  }

  // Header
  line('QUEER.GUIDE — PERSONEN-DATENBLATT', 8, true, 2)
  y += 4
  line(p.name, 20, true, 6)
  if (p.profession) line(p.profession, 11, false, 2)
  if (p.pronouns) line(p.pronouns, 10, false, 2)
  y += 8
  doc.setDrawColor(200)
  doc.line(margin, y, width - margin, y)
  y += 16

  // Fields
  field('Lebensdaten', [p.birth_date, p.death_date].filter(Boolean).join(' – '))
  field('Geburtsort', p.birth_place)
  field('Todesort', p.death_place)
  field('Nationalität', p.nationality)
  field('Beschreibung', p.description)
  field('Bio', p.bio)
  field('LGBTI-Bezug', p.lgbti_connection)
  field('LGBTI-Details', p.lgbti_details)
  field('Meilenstein', p.milestone)
  field('Tags', p.tags)
  field('Website', p.website_url)
  field('Wikipedia', p.wikipedia_url)
  field('Sichtbarkeit', p.visibility)
  field('Review-Status', p.review_status)
  field('Verifizierung', p.verification_status)
  field('queer.guide', `${SITE}/personalities/${p.slug}`)

  // Footer
  y = doc.internal.pageSize.getHeight() - margin + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text(`ID ${p.id} · Datenblatt (Entwurf)`, margin, y)

  doc.save(`${p.slug || 'person'}.pdf`)
}

// Milestone datasheet PDF.
export function milestoneDatasheet(m: Milestone) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 48
  const width = doc.internal.pageSize.getWidth()
  let y = margin

  const write = (text: string, size: number, bold: boolean, gap: number) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    for (const l of doc.splitTextToSize(text, width - margin * 2)) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(l, margin, y)
      y += size + gap
    }
  }
  const field = (label: string, value?: string) => {
    if (!value) return
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    for (const l of doc.splitTextToSize(value, width - margin * 2 - 120)) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(l, margin + 120, y)
      y += 13
    }
    y += 3
  }

  write('QUEER.GUIDE — MEILENSTEIN-DATENBLATT', 8, true, 2)
  y += 4
  write(m.title, 18, true, 6)
  y += 6
  doc.setDrawColor(200)
  doc.line(margin, y, width - margin, y)
  y += 16

  const when = [m.date, m.date_end].filter(Boolean).join(' – ')
  field('Datum', when)
  field('Ort', m.location)
  field('Stadt', m.city)
  field('Region', m.region)
  field('Land', m.country)
  field('Kategorie', m.category)
  field('Wichtigkeit', `${m.significance}/5`)
  field('Richtung', IMPACT_LABEL[m.impact])
  field('Geprüft', m.checked ? 'ja' : 'nein')
  y += 6
  write('Beschreibung', 10, true, 4)
  write(m.description, 10, false, 4)

  if (m.sources.length) {
    y += 8
    write('Quellen', 10, true, 4)
    for (const s of m.sources) {
      write(`• ${s.label}${s.url ? ` — ${s.url}` : ''}`, 9, false, 3)
    }
  }
  if (m.linked_persons.length) {
    y += 8
    write('Verknüpfte Personen', 10, true, 4)
    for (const p of m.linked_persons) {
      const role = p.role ? ` (${p.role})` : ''
      write(`• ${p.name}${role} — ${SITE}/personalities/${p.slug}`, 9, false, 3)
    }
  }

  y = doc.internal.pageSize.getHeight() - margin + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text(`Milestone ${m.id} · Datenblatt (Entwurf)`, margin, y)

  doc.save(`milestone-${m.id}.pdf`)
}
