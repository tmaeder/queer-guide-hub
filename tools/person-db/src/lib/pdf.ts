import { jsPDF } from 'jspdf'
import type { Personality } from '../types'

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
