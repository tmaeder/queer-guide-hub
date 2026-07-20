// Aufklappbare Info-Karte in der Milestone-Ansicht: was zählt bei uns als
// Meilenstein. Gleicher Inhalt wie docs/meilenstein-definition.md — beim Ändern
// beide synchron halten.
export function MilestoneInfo() {
  return (
    <details className="ms-info">
      <summary>Was ist ein Meilenstein? (Definition &amp; Aufnahmekriterien)</summary>
      <div className="ms-info-body">
        <p>
          Ein Meilenstein ist ein <strong>datiertes, bedeutsames, belegtes Ereignis</strong> der
          queeren Geschichte und LGBTQ+-Rechte — Gesetz, Gerichtsurteil, Aufstand,
          Entpathologisierung oder Verfolgung. Mit Personen verknüpfbar, mit Wertung.
        </p>
        <p className="ms-info-h">Aufnahmekriterien</p>
        <ul>
          <li><strong>Exaktes Tagesdatum</strong> (YYYY-MM-DD) + mind. 1 Quelle. Nur Jahr/Monat → nicht aufnehmen, nichts raten.</li>
          <li>Bei Gesetzen zählt das <strong>Inkrafttreten</strong> — nicht Beschluss/Unterschrift/erste Zeremonie.</li>
          <li><strong>Nationale Ebene</strong> — nur regional/kommunal ist kein Länder-Meilenstein.</li>
          <li>Belegbarkeit vor Vollständigkeit: lieber offen lassen als unbelegt aufnehmen.</li>
        </ul>
        <p className="ms-info-h">Wichtigkeit 1–5</p>
        <p>
          5 = welthistorisch/weltweit erste · 4 = national sehr bedeutend / erster auf einem Kontinent ·
          3 = wichtig (Standard) · 2 = lokal/spezifisch · 1 = Randnotiz.
        </p>
        <p className="ms-info-h">Richtung</p>
        <p>positiv = Fortschritt · neutral · negativ = Rückschritt/Verfolgung.</p>
        <p className="hint">
          Vollständig: <code>docs/meilenstein-definition.md</code>. Erweiterbar — später ggf. News als
          Quelle/Kategorie, und Umzug in die Live-DB mit Personen-Verknüpfung.
        </p>
      </div>
    </details>
  )
}
