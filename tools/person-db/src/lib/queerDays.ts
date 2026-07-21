// Kuratierte queere Aktions-/Gedenktage (fixe Kalendertage) für die
// Upcoming-Ansicht. Nur international etablierte, queer-spezifische Tage.
// Variable Termine (z. B. Spirit Day = 3. Donnerstag im Oktober) bewusst
// (noch) nicht enthalten — nur tagesgenaue Fixtermine.

export interface QueerDay {
  md: string // 'MM-DD'
  name: string
  note?: string
}

export interface QueerDayEvent {
  occurs_on: string // 'YYYY-MM-DD'
  name: string
  note?: string
}

export const QUEER_DAYS: QueerDay[] = [
  { md: '03-31', name: 'Transgender Day of Visibility (TDOV)', note: 'Sichtbarkeit von trans Menschen' },
  { md: '04-06', name: 'Internationaler Tag der Asexualität', note: 'Asexual visibility' },
  { md: '04-26', name: 'Lesbian Visibility Day', note: 'Sichtbarkeit lesbischer Menschen' },
  { md: '05-17', name: 'IDAHOBIT', note: 'Int. Tag gegen Homo-, Bi-, Inter- & Transfeindlichkeit' },
  { md: '05-22', name: 'Harvey Milk Day', note: 'Gedenken an Harvey Milk' },
  { md: '05-24', name: 'Pan- & Panromantic Visibility Day' },
  { md: '06-28', name: 'Jahrestag der Stonewall-Aufstände', note: 'Wurzel von Pride / CSD' },
  { md: '07-14', name: 'Internationaler Tag der nichtbinären Menschen' },
  { md: '09-23', name: 'Bi Visibility Day', note: 'Celebrate Bisexuality Day' },
  { md: '10-11', name: 'Coming-Out-Tag', note: 'National Coming Out Day' },
  { md: '10-26', name: 'Intersex Awareness Day' },
  { md: '11-08', name: 'Intersex Day of Solidarity' },
  { md: '11-20', name: 'Transgender Day of Remembrance (TDOR)', note: 'Gedenken an ermordete trans Menschen' },
  { md: '12-01', name: 'Welt-AIDS-Tag' },
]

// Alle Aktionstage, die im Fenster [fromIso, toIso] (inkl.) liegen.
// Prüft laufendes + Folgejahr, um Jahreswechsel im 30-Tage-Fenster abzudecken.
export function queerDaysInRange(fromIso: string, toIso: string): QueerDayEvent[] {
  const out: QueerDayEvent[] = []
  const fromYear = Number(fromIso.slice(0, 4))
  for (const d of QUEER_DAYS) {
    for (const y of [fromYear, fromYear + 1]) {
      const occurs_on = `${y}-${d.md}`
      if (occurs_on >= fromIso && occurs_on <= toIso) {
        out.push({ occurs_on, name: d.name, note: d.note })
      }
    }
  }
  return out.sort((a, b) => a.occurs_on.localeCompare(b.occurs_on))
}
