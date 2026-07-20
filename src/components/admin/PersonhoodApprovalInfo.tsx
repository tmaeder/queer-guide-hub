/**
 * PersonhoodApprovalInfo — the fixed "how does person release work" info point,
 * shown on the Personalities admin surface. Static, self-contained, collapsible
 * (native <details>). The canonical written record is docs/personen-freigabe-visum.md;
 * keep the two in sync.
 */

const STAMPS: { n: number; title: string; who: string; detail: string }[] = [
  { n: 1, title: 'Pflichtangaben vollständig', who: 'automatisch', detail: 'Name · Geburtsdatum · LGBTQ+-Bezug · Beruf/Tätigkeit · Bild' },
  { n: 2, title: 'Beleg vorhanden', who: 'automatisch', detail: 'mindestens eine Quelle (Wikipedia / Wikidata / Link)' },
  { n: 3, title: 'KI-Check bestanden', who: 'automatisch', detail: 'keine Widersprüche, Angaben plausibel' },
  { n: 4, title: 'Kein Duplikat', who: 'automatisch', detail: 'Person existiert nicht doppelt' },
  { n: 5, title: 'Mensch-Freigabe (Vier-Augen)', who: 'Mensch', detail: 'bestätigt von jemand anderem als der/die erfasst hat' },
];

export function PersonhoodApprovalInfo() {
  return (
    <details className="rounded-container border border-border bg-muted/30 px-4 py-2 sm:px-6">
      <summary className="cursor-pointer list-none py-2 text-15 font-semibold text-foreground">
        So funktioniert die Freigabe von Personen (Visum-Prinzip)
      </summary>

      <div className="pb-2 pt-2 text-13 text-muted-foreground">
        <p className="mb-4">
          <span className="font-medium text-foreground">Online = geprüft.</span> Eine Person ist
          auf Website + Suche nur sichtbar, wenn alle Prüf-Stempel gesetzt sind. Stempel 1–4 setzt
          das System automatisch, Stempel 5 ist die redaktionelle Freigabe.
        </p>

        <ol className="mb-4 space-y-2">
          {STAMPS.map((s) => (
            <li key={s.n} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-border text-2xs font-semibold text-foreground">
                {s.n}
              </span>
              <span>
                <span className="font-medium text-foreground">{s.title}</span>
                <span className="text-2xs uppercase tracking-wide"> · {s.who}</span>
                <br />
                {s.detail}
              </span>
            </li>
          ))}
        </ol>

        <div className="mb-4 rounded-element border border-border bg-background p-4">
          <p className="mb-2 font-medium text-foreground">Zwei Regeln, die Qualität sichern</p>
          <p className="mb-1">
            <span className="font-medium text-foreground">Vier-Augen:</span> Wer eine Person
            erfasst/bearbeitet, gibt sie nicht selbst frei — ein zweiter Mensch setzt Stempel 5.
          </p>
          <p>
            <span className="font-medium text-foreground">Visum verfällt:</span> Wird später eine
            wichtige Angabe geändert, fällt die Person zurück auf „zu prüfen" und verschwindet von
            der Website, bis die Stempel erneut gesetzt sind.
          </p>
        </div>

        <p className="text-2xs">
          Vollständig festgehalten in <code>docs/personen-freigabe-visum.md</code>. Umsetzung in
          Schritten: Stempelkarte → automatische Stempel 1–4 → Freigabe-Knopf + Vier-Augen →
          Visum-Verfall. Stand: Konzept dokumentiert, Bau folgt.
        </p>
      </div>
    </details>
  );
}
