// Milestone data model — events in queer history, linkable to persons.
// v1 lives in the tool (seed + localStorage), NOT in the live DB, so we can
// settle the schema before a migration. Later: promote to a `milestones` table
// + N:M link to personalities.

export interface MilestoneSource {
  label: string
  url?: string
}

export interface LinkedPerson {
  slug: string
  name: string
  role?: string // Zusammenhang: wie die Person zum Milestone steht
}

// Direction of the event for LGBTQ+ development.
export type Impact = 'positive' | 'neutral' | 'negative'
export const IMPACT_VALUES: Impact[] = ['positive', 'neutral', 'negative']
export const IMPACT_LABEL: Record<Impact, string> = {
  positive: 'positiv / Fortschritt',
  neutral: 'neutral',
  negative: 'negativ / Rückschritt',
}

export interface Milestone {
  id: string
  title: string
  date: string // 'YYYY-MM-DD' or 'YYYY' (start)
  date_end?: string
  location?: string
  city?: string
  region?: string
  country?: string
  description: string
  sources: MilestoneSource[]
  linked_persons: LinkedPerson[]
  category?: string
  significance: number // 1..5 importance in history
  impact: Impact // direction for development
  checked: boolean
}

const BASE_SEED: Milestone[] = [
  {
    id: 'stonewall-1969',
    title: 'Stonewall-Aufstände (Christopher Street)',
    date: '1969-06-28',
    date_end: '1969-07-03',
    location: 'Stonewall Inn, Christopher Street, Greenwich Village',
    city: 'New York City',
    region: 'New York',
    country: 'USA',
    description:
      'In den frühen Morgenstunden des 28. Juni 1969 kam es nach einer Polizeirazzia ' +
      'im Stonewall Inn an der Christopher Street zu spontanem Widerstand von Gästen ' +
      'und Anwohner:innen. Die mehrtägigen Proteste gelten als Wendepunkt und Auslöser ' +
      'der modernen LGBTQ+-Bewegung. Zum ersten Jahrestag 1970 fanden die ersten ' +
      'Pride-Märsche (Christopher Street Liberation Day) statt — bis heute erinnern ' +
      'Christopher Street Day und Pride weltweit daran.',
    sources: [
      { label: 'Wikipedia — Stonewall-Aufstände', url: 'https://de.wikipedia.org/wiki/Stonewall' },
      { label: 'Library of Congress — Stonewall', url: 'https://guides.loc.gov/lgbtq-studies/stonewall-era' },
      { label: 'NYC LGBT Historic Sites Project', url: 'https://www.nyclgbtsites.org/site/stonewall-inn/' },
    ],
    linked_persons: [
      { slug: 'marsha-p-johnson', name: 'Marsha P. Johnson', role: 'Beteiligte am Aufstand, Wegbereiterin' },
      { slug: 'sylvia-rivera', name: 'Sylvia Rivera', role: 'Beteiligte am Aufstand, Aktivistin' },
      { slug: 'storme-delarverie', name: 'Stormé DeLarverie', role: 'Beteiligte am Aufstand' },
    ],
    category: 'Aufstand / Bewegung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-fuer-alle-schweiz-2021',
    title: 'Ehe für alle (Schweiz)',
    date: '2022-07-01',
    location: '',
    city: '',
    region: '',
    country: 'Schweiz',
    description:
      'In der Volksabstimmung am 26. September 2021 nahm die Schweiz die "Ehe für ' +
      'alle" mit rund 64,1 % Ja an. Gleichgeschlechtliche Paare können seither ' +
      'heiraten, gemeinsam Kinder adoptieren; verheirateten lesbischen Paaren steht ' +
      'die Samenspende offen. In Kraft getreten am 1. Juli 2022.',
    sources: [
      { label: 'Wikipedia — Ehe für alle (Schweiz)', url: 'https://de.wikipedia.org/wiki/Ehe_f%C3%BCr_alle_(Schweiz)' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'paragraph-175-abschaffung-1994',
    title: 'Abschaffung des § 175 (Deutschland)',
    date: '1994-06-11',
    location: '',
    city: '',
    region: '',
    country: 'Deutschland',
    description:
      'Der § 175 stellte sexuelle Handlungen zwischen Männern unter Strafe. Nach ' +
      'Reformen 1969 und 1973 wurde er 1994 im Zuge der deutschen Einheit ersatzlos ' +
      'gestrichen. 2017 folgten die Rehabilitierung und Entschädigung der nach § 175 ' +
      'Verurteilten.',
    sources: [
      { label: 'Wikipedia — § 175', url: 'https://de.wikipedia.org/wiki/%C2%A7_175' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'who-entpathologisierung-1990',
    title: 'WHO streicht Homosexualität aus dem Krankheitskatalog',
    date: '1990-05-17',
    location: '',
    city: 'Genf',
    region: '',
    country: 'Schweiz',
    description:
      'Am 17. Mai 1990 entfernte die Weltgesundheitsorganisation (WHO) Homosexualität ' +
      'aus der internationalen Klassifikation der Krankheiten (ICD-10). Ein Meilenstein ' +
      'der Entpathologisierung — der Tag wird heute als Internationaler Tag gegen ' +
      'Homo-, Bi-, Inter- und Transfeindlichkeit (IDAHOBIT) begangen.',
    sources: [
      { label: 'Wikipedia — IDAHOBIT', url: 'https://de.wikipedia.org/wiki/Internationaler_Tag_gegen_Homo-,_Bi-,_Inter-_und_Transfeindlichkeit' },
    ],
    linked_persons: [],
    category: 'Entpathologisierung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'institut-sexualwissenschaft-buecherverbrennung-1933',
    title: 'Zerstörung des Instituts für Sexualwissenschaft & Bücherverbrennung',
    date: '1933-05-06',
    date_end: '1933-05-10',
    location: 'Institut für Sexualwissenschaft / Opernplatz, Berlin',
    city: 'Berlin',
    region: '',
    country: 'Deutschland',
    description:
      'Am 6. Mai 1933 plünderten Nationalsozialisten das von Magnus Hirschfeld ' +
      'gegründete Institut für Sexualwissenschaft. Bibliothek und Archive wurden am ' +
      '10. Mai 1933 auf dem Berliner Opernplatz öffentlich verbrannt. Ein schwerer ' +
      'Rückschlag für sexualwissenschaftliche Forschung und queere Emanzipation.',
    sources: [
      { label: 'Wikipedia — Institut für Sexualwissenschaft', url: 'https://de.wikipedia.org/wiki/Institut_f%C3%BCr_Sexualwissenschaft' },
      { label: 'Wikipedia — Magnus Hirschfeld', url: 'https://de.wikipedia.org/wiki/Magnus_Hirschfeld' },
    ],
    linked_persons: [{ slug: 'magnus-hirschfeld', name: 'Magnus Hirschfeld', role: 'Gründer des zerstörten Instituts für Sexualwissenschaft' }],
    category: 'Verfolgung / Zerstörung',
    significance: 5,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'paragraph-175-inkrafttreten-1872',
    title: '§ 175 tritt in Kraft (Deutsches Reich)',
    date: '1872-01-01',
    country: 'Deutschland',
    description:
      'Mit dem Strafgesetzbuch des Deutschen Reichs trat am 1. Januar 1872 der § 175 ' +
      'in Kraft — er stellte „widernatürliche Unzucht" zwischen Männern unter Strafe. ' +
      'Grundlage der strafrechtlichen Verfolgung Homosexueller in Deutschland bis 1994.',
    sources: [
      { label: 'Wikipedia — § 175 StGB', url: 'https://de.wikipedia.org/wiki/%C2%A7_175_Strafgesetzbuch_(Deutschland)' },
    ],
    linked_persons: [{ slug: 'karl-heinrich-ulrichs', name: 'Karl Heinrich Ulrichs', role: 'Früher Aktivist gegen die Strafbarkeit' }],
    category: 'Recht / Kriminalisierung',
    significance: 4,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'paragraph-175-ns-verschaerfung-1935',
    title: 'NS-Verschärfung des § 175',
    date: '1935-09-01',
    country: 'Deutschland',
    description:
      'Gesetz vom 28. Juni 1935, in Kraft am 1. September 1935: Die Nationalsozialisten ' +
      'verschärften § 175 drastisch und fügten § 175a hinzu (bis zu zehn Jahre Zuchthaus ' +
      'für „qualifizierte Fälle"). Grundlage der systematischen Verfolgung — tausende ' +
      'Männer wurden verurteilt und in Konzentrationslager deportiert.',
    sources: [
      { label: 'Wikipedia — § 175 StGB', url: 'https://de.wikipedia.org/wiki/%C2%A7_175_Strafgesetzbuch_(Deutschland)' },
    ],
    linked_persons: [{ slug: 'magnus-hirschfeld', name: 'Magnus Hirschfeld', role: 'Verfolgt; sein Institut wurde zerstört' }],
    category: 'Verfolgung / Zerstörung',
    significance: 5,
    impact: 'negative',
    checked: false,
  },
]

// Entkriminalisierung — NUR tagesgenau belegte Daten (Deep-Research, je 3-0 verifiziert).
// Jurisdiktion, exaktes Datum, Mechanismus + Quellen. Jahres-Angaben bewusst weggelassen.
const decrimSeed: Milestone[] = [
  {
    id: 'decrim-vereinigtes-koenigreich-1967-07-27',
    title: 'Entkriminalisierung der Homosexualität — England & Wales',
    date: '1967-07-27',
    country: 'Vereinigtes Königreich',
    description:
      'Sexual Offences Act 1967 — Royal Assent und Inkrafttreten am selben Tag (27. Juli 1967). ' +
      'Straffreiheit für einvernehmliche Handlungen unter Männern ab 21 in privatem Rahmen; ' +
      'gilt nur für England & Wales (Schottland/Nordirland separat).',
    sources: [
      { label: 'Wikipedia — Sexual Offences Act 1967', url: 'https://en.wikipedia.org/wiki/Sexual_Offences_Act_1967' },
      { label: 'House of Lords Library — 50 years', url: 'https://lordslibrary.parliament.uk/research-briefings/lln-2017-0045/' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-deutschland-1969-09-01',
    title: 'Teil-Entkriminalisierung § 175 (BRD)',
    date: '1969-09-01',
    country: 'Deutschland',
    description:
      '1. Strafrechtsreformgesetz (ausgefertigt 25. Juni 1969, in Kraft 1. September 1969): ' +
      '§ 175 wird vom Totalverbot auf einvernehmliche Handlungen unter Männern ab 21 reduziert. ' +
      'Vollständige Aufhebung erst 1994 (eigener Eintrag).',
    sources: [
      { label: 'Wikipedia — § 175 StGB', url: 'https://de.wikipedia.org/wiki/%C2%A7_175_Strafgesetzbuch_(Deutschland)' },
      { label: 'dejure — BGBl. I 1969 S. 645', url: 'https://dejure.org/BGBl/1969/BGBl._I_S._645' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-norwegen-1972-04-21',
    title: 'Entkriminalisierung der Homosexualität — Norwegen',
    date: '1972-04-21',
    country: 'Norwegen',
    description:
      'Aufhebung von § 213 des Strafgesetzbuchs am 21. April 1972. Das norwegische Parlament ' +
      '(Storting) datiert den Tag selbst als Ende der Strafbarkeit sexueller Handlungen unter Männern.',
    sources: [
      { label: 'Storting (norweg. Parlament)', url: 'https://www.stortinget.no/en/In-English/About-the-Storting/historical-highlights/the-decriminalization-of-homosexuality/' },
      { label: 'Wikipedia — Section 213 (Norway)', url: 'https://en.wikipedia.org/wiki/Section_213_of_the_Norwegian_Penal_Code' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-malta-1973-01-29',
    title: 'Entkriminalisierung der Homosexualität — Malta',
    date: '1973-01-29',
    country: 'Malta',
    description:
      'Am 29. Januar 1973 stimmte das maltesische Parlament (28:26) für die Änderung des ' +
      'Strafgesetzbuchs und strich das aus britischer Zeit stammende Verbot. (Abstimmungsdatum; ' +
      'separates Inkrafttreten nicht gesondert belegt.)',
    sources: [
      { label: 'Wikipedia — LGBTQ rights in Malta', url: 'https://en.wikipedia.org/wiki/LGBTQ_rights_in_Malta' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-schottland-1981-02-01',
    title: 'Entkriminalisierung der Homosexualität — Schottland',
    date: '1981-02-01',
    country: 'Schottland',
    description:
      'Criminal Justice (Scotland) Act 1980, § 80 (Royal Assent 13. November 1980, in Kraft ' +
      '1. Februar 1981): Straffreiheit für einvernehmliche Handlungen unter Männern ab 21 in privatem Rahmen.',
    sources: [
      { label: 'Wikipedia — Criminal Justice (Scotland) Act 1980', url: 'https://en.wikipedia.org/wiki/Criminal_Justice_(Scotland)_Act_1980' },
      { label: 'legislation.gov.uk — s.80', url: 'https://www.legislation.gov.uk/ukpga/1980/62/section/80/enacted' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-nordirland-1982-10-27',
    title: 'Entkriminalisierung der Homosexualität — Nordirland',
    date: '1982-10-27',
    country: 'Nordirland',
    description:
      'Homosexual Offences (Northern Ireland) Order 1982 (SI 1982/1536), erlassen („made") am ' +
      '27. Oktober 1982 — Folge des EGMR-Urteils Dudgeon gegen Vereinigtes Königreich (1981). ' +
      '(Erlass-Datum belegt; Inkrafttreten in den Quellen uneinheitlich.)',
    sources: [
      { label: 'Wikipedia — Homosexual Offences (NI) Order 1982', url: 'https://en.wikipedia.org/wiki/Homosexual_Offences_(Northern_Ireland)_Order_1982' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-irland-1993-07-07',
    title: 'Entkriminalisierung der Homosexualität — Irland',
    date: '1993-07-07',
    country: 'Irland',
    description:
      'Criminal Law (Sexual Offences) Act 1993 (Nr. 20 von 1993), Datum des Erlasses 7. Juli 1993 — ' +
      'hebt die Strafbarkeit auf (Folge von Norris gegen Irland, EGMR).',
    sources: [
      { label: 'Irish Statute Book — Act 20/1993', url: 'https://www.irishstatutebook.ie/eli/1993/act/20/enacted/en/html' },
      { label: 'Law Reform Commission (revised)', url: 'https://revisedacts.lawreform.ie/eli/1993/act/20/revised/en/html' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-italien-1890-01-01',
    title: 'Entkriminalisierung der Homosexualität — Italien',
    date: '1890-01-01',
    country: 'Italien',
    description:
      'Der Codice Zanardelli (italienisches Strafgesetzbuch, von beiden Kammern am ' +
      '30. Juni 1889 beschlossen) trat am 1. Januar 1890 in Kraft und enthielt kein ' +
      'Verbot einvernehmlicher gleichgeschlechtlicher Handlungen mehr — seither ' +
      'landesweit straffrei. (Inkrafttreten des Strafgesetzbuchs.)',
    sources: [
      { label: 'Wikipedia — Zanardelli Code', url: 'https://en.wikipedia.org/wiki/Zanardelli_Code' },
      { label: 'Wikipedia — LGBTQ rights in Italy', url: 'https://en.wikipedia.org/wiki/LGBTQ_rights_in_Italy' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-spanien-1978-12-26',
    title: 'Entkriminalisierung der Homosexualität — Spanien',
    date: '1978-12-26',
    country: 'Spanien',
    description:
      'Ley 77/1978 vom 26. Dezember 1978 änderte die Ley de Peligrosidad y ' +
      'Rehabilitación Social und strich Homosexualität als Grund für „Gefährlichkeit". ' +
      'Das spanische Außenministerium datiert die Entkriminalisierung auf den ' +
      '26. Dezember 1978 (volle Wirksamkeit teils mit 1979 angegeben).',
    sources: [
      { label: 'Wikidata — Entkriminalisierung in Spanien (Q114050751)', url: 'https://www.wikidata.org/wiki/Q114050751' },
      { label: 'Wikipedia — LGBTQ history in Spain', url: 'https://en.wikipedia.org/wiki/LGBTQ_history_in_Spain' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'decrim-zypern-1998-05-21',
    title: 'Entkriminalisierung der Homosexualität — Zypern',
    date: '1998-05-21',
    country: 'Zypern',
    description:
      'Am 21. Mai 1998 verabschiedete das zyprische Repräsentantenhaus das Gesetz 40(I)/98 — ' +
      'acht Tage vor der Frist des Europarats; Folge von Modinos gegen Zypern (EGMR). ' +
      '(Parlaments-Verabschiedung; amtliches Inkrafttreten evtl. wenige Tage später.)',
    sources: [
      { label: 'Wikipedia — Section 171 (Cyprus)', url: 'https://en.wikipedia.org/wiki/Section_171_of_the_Criminal_Code_of_Cyprus' },
      { label: 'Wikipedia — LGBTQ rights in Cyprus', url: 'https://en.wikipedia.org/wiki/LGBTQ_rights_in_Cyprus' },
    ],
    linked_persons: [],
    category: 'Recht / Entkriminalisierung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
]

// Ehe für alle & erste eingetragene Partnerschaft — Inkrafttreten (Europa).
// Nur tagesgenau belegte Daten (Deep-Research, je 3-0 gegengeprüft, 2026-07).
// Länder ohne verifiziertes Tagesdatum (Portugal, Island, Frankreich, Irland,
// Luxemburg u.a.) bewusst NICHT aufgenommen — nicht raten.
const unionSeed: Milestone[] = [
  {
    id: 'ehe-niederlande-2001-04-01',
    title: 'Ehe für alle (Niederlande) — weltweit erste',
    date: '2001-04-01',
    country: 'Niederlande',
    description:
      'Die Niederlande waren das weltweit erste Land mit der Ehe für gleichgeschlechtliche ' +
      'Paare. Königliche Zustimmung am 21.12.2000; in Kraft getreten am 1. April 2001 — die ' +
      'ersten vier Paare wurden um Mitternacht von Amsterdams Bürgermeister Job Cohen getraut.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in the Netherlands', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_the_Netherlands' },
      { label: 'Wikipedia — Timeline of same-sex marriage', url: 'https://en.wikipedia.org/wiki/Timeline_of_same-sex_marriage' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-belgien-2003-06-01',
    title: 'Ehe für alle (Belgien)',
    date: '2003-06-01',
    country: 'Belgien',
    description:
      'Belgien war das zweite Land weltweit mit der Ehe für alle. Königliche Zustimmung am ' +
      '13.2.2003; in Kraft getreten am 1. Juni 2003.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Belgium', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Belgium' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-spanien-2005-07-03',
    title: 'Ehe für alle (Spanien)',
    date: '2005-07-03',
    country: 'Spanien',
    description:
      'Ley 13/2005: im Congreso am 30.6.2005 beschlossen, im BOE am 2.7.2005 veröffentlicht, ' +
      'in Kraft getreten am 3. Juli 2005 (erste Trauungen am 11.7.). Drittes Land weltweit.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Spain', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Spain' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-norwegen-2009-01-01',
    title: 'Ehe für alle (Norwegen)',
    date: '2009-01-01',
    country: 'Norwegen',
    description:
      'Geschlechtsneutrales Ehegesetz, königliche Zustimmung am 27.6.2008; in Kraft getreten ' +
      'am 1. Januar 2009 (erstes Paar am 2.1.2009 am Osloer Gericht).',
    sources: [
      { label: 'Wikipedia — Timeline of same-sex marriage', url: 'https://en.wikipedia.org/wiki/Timeline_of_same-sex_marriage' },
      { label: 'Library of Congress — Global Legal Monitor', url: 'https://www.loc.gov/item/global-legal-monitor/' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-schweden-2009-05-01',
    title: 'Ehe für alle (Schweden)',
    date: '2009-05-01',
    country: 'Schweden',
    description:
      'Gesetz 2009:253, vom Reichstag am 1.4.2009 beschlossen; in Kraft getreten am 1. Mai 2009. ' +
      '(Eine eingetragene Partnerschaft bestand in Schweden bereits seit 1995.)',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Sweden', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Sweden' },
      { label: 'Library of Congress — Global Legal Monitor', url: 'https://www.loc.gov/item/global-legal-monitor/' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-finnland-2017-03-01',
    title: 'Ehe für alle (Finnland)',
    date: '2017-03-01',
    country: 'Finnland',
    description:
      '2014 vom Parlament beschlossen, 2015 unterzeichnet; nach Übergangsfrist in Kraft getreten ' +
      'am 1. März 2017.',
    sources: [
      { label: 'Wikipedia — Timeline of same-sex marriage', url: 'https://en.wikipedia.org/wiki/Timeline_of_same-sex_marriage' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-malta-2017-09-01',
    title: 'Ehe für alle (Malta)',
    date: '2017-09-01',
    country: 'Malta',
    description:
      'Am 12.7.2017 beschlossen; in Kraft getreten am 1. September 2017.',
    sources: [
      { label: 'The Malta Independent (2017-08-31)', url: 'https://www.independent.com.mt/' },
      { label: 'Wikipedia — Gleichgeschlechtliche Ehe', url: 'https://de.wikipedia.org/wiki/Gleichgeschlechtliche_Ehe' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-deutschland-2017-10-01',
    title: 'Ehe für alle (Deutschland)',
    date: '2017-10-01',
    country: 'Deutschland',
    description:
      'Bundestag 30.6.2017, Bundesrat 7.7., Ausfertigung 20.7., Verkündung im BGBl 28.7.2017; ' +
      'in Kraft getreten am ersten Tag des dritten Monats nach Verkündung = 1. Oktober 2017 ' +
      '(erste Trauung Karl Kreile & Bodo Mende, Berlin).',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Germany', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Germany' },
      { label: 'LSVD — Ehe für alle in Europa und weltweit', url: 'https://www.lsvd.de/de/ct/427-Die-gleichgeschlechtliche-Ehe-in-Europa-und-weltweit' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-england-wales-2014-03-13',
    title: 'Ehe für alle (England & Wales)',
    date: '2014-03-13',
    country: 'Vereinigtes Königreich',
    region: 'England & Wales',
    description:
      'Marriage (Same Sex Couples) Act 2013: die Regelungen traten am 13. März 2014 in Kraft; ' +
      'erste Trauungen am 29.3.2014 (16-tägige Anmeldefrist).',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in the United Kingdom', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_the_United_Kingdom' },
      { label: 'legislation.gov.uk — Commencement No.2 Order', url: 'https://www.legislation.gov.uk/uksi/2014/93' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-schottland-2014-12-16',
    title: 'Ehe für alle (Schottland)',
    date: '2014-12-16',
    country: 'Vereinigtes Königreich',
    region: 'Schottland',
    description:
      'Marriage and Civil Partnership (Scotland) Act 2014: in Kraft getreten am 16. Dezember 2014 ' +
      '(erste neue Trauungen am 31.12.2014).',
    sources: [
      { label: 'legislation.gov.uk — asp 2014/5', url: 'https://www.legislation.gov.uk/asp/2014/5' },
      { label: 'Wikipedia — Same-sex marriage in the United Kingdom', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_the_United_Kingdom' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-nordirland-2020-01-13',
    title: 'Ehe für alle (Nordirland)',
    date: '2020-01-13',
    country: 'Vereinigtes Königreich',
    region: 'Nordirland',
    description:
      'Über Regelungen nach dem Northern Ireland (Executive Formation etc) Act 2019 in Kraft ' +
      'getreten am 13. Januar 2020 (erste Trauung Robyn Peoples & Sharni Edwards-Peoples am 11.2.2020).',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Northern Ireland', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Northern_Ireland' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-oesterreich-2019-01-01',
    title: 'Ehe für alle (Österreich)',
    date: '2019-01-01',
    country: 'Österreich',
    description:
      'Der Verfassungsgerichtshof (VfGH) hob die Beschränkung mit Wirkung zum 1. Januar 2019 auf; ' +
      'ab da war die Ehe allgemein zugänglich.',
    sources: [
      { label: 'Library of Congress — Global Legal Monitor', url: 'https://www.loc.gov/item/global-legal-monitor/' },
      { label: 'Wikipedia — Same-sex marriage in Austria', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Austria' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-slowenien-2023-01-31',
    title: 'Ehe für alle (Slowenien)',
    date: '2023-01-31',
    country: 'Slowenien',
    description:
      'Nach dem Verfassungsgerichtsurteil (wirksam 8./9.7.2022) beschloss die Nationalversammlung ' +
      'die Novelle des Familiengesetzbuchs; Inkrafttreten am 31. Januar 2023.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Slovenia', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Slovenia' },
      { label: 'GOV.SI — News', url: 'https://www.gov.si/en/news/' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-andorra-2023-02-17',
    title: 'Ehe für alle (Andorra)',
    date: '2023-02-17',
    country: 'Andorra',
    description:
      'Gesetz am 17.8.2022 verkündet; sechs Monate später in Kraft getreten am 17. Februar 2023.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Andorra', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Andorra' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-estland-2024-01-01',
    title: 'Ehe für alle (Estland)',
    date: '2024-01-01',
    country: 'Estland',
    description:
      'Im Juni 2023 beschlossen; in Kraft getreten am 1. Januar 2024 — erstes Land des ehemaligen ' +
      'Ostblocks mit der Ehe für alle.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Estonia', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Estonia' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-griechenland-2024-02-16',
    title: 'Ehe für alle (Griechenland)',
    date: '2024-02-16',
    country: 'Griechenland',
    description:
      'Vom Parlament am 15.2.2024 beschlossen; in Kraft getreten mit der Veröffentlichung im ' +
      'Amtsblatt am 16. Februar 2024 — erstes mehrheitlich orthodoxes Land mit der Ehe für alle.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Greece', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Greece' },
      { label: 'Equaldex — Greece', url: 'https://www.equaldex.com/region/greece' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-liechtenstein-2025-01-01',
    title: 'Ehe für alle (Liechtenstein)',
    date: '2025-01-01',
    country: 'Liechtenstein',
    description:
      'Vom Landtag am 16.5.2024 beschlossen, fürstliche Sanktion am 9.7.2024; in Kraft getreten ' +
      'am 1. Januar 2025.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Liechtenstein', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Liechtenstein' },
      { label: 'LSVD — Ehe für alle in Europa und weltweit', url: 'https://www.lsvd.de/de/ct/427-Die-gleichgeschlechtliche-Ehe-in-Europa-und-weltweit' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-portugal-2010-06-05',
    title: 'Ehe für alle (Portugal)',
    date: '2010-06-05',
    country: 'Portugal',
    description:
      'Vom Parlament am 11.2.2010 beschlossen, vom Präsidenten am 17.5.2010 ratifiziert, ' +
      'im Diário da República am 31.5.2010 veröffentlicht; in Kraft getreten am 5. Juni 2010 ' +
      '(erste Trauungen am 7.6.).',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Portugal', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Portugal' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-island-2010-06-27',
    title: 'Ehe für alle (Island)',
    date: '2010-06-27',
    country: 'Island',
    description:
      'Vom Althing beschlossen und von Präsident Ólafur Ragnar Grímsson am 22.6.2010 ' +
      'unterzeichnet; fünf Tage später in Kraft getreten am 27. Juni 2010.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Iceland', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Iceland' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-frankreich-2013-05-18',
    title: 'Ehe für alle (Frankreich)',
    date: '2013-05-18',
    country: 'Frankreich',
    description:
      'Loi 2013-404: vom Verfassungsrat gebilligt und von Präsident Hollande am 17.5.2013 ' +
      'verkündet, am 18.5.2013 im Journal Officiel veröffentlicht — mit der Veröffentlichung ' +
      'in Kraft getreten (erste Trauung am 29.5.2013 in Montpellier).',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in France', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_France' },
      { label: 'Wikipedia — Law 2013-404', url: 'https://en.wikipedia.org/wiki/Law_2013-404' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-luxemburg-2015-01-01',
    title: 'Ehe für alle (Luxemburg)',
    date: '2015-01-01',
    country: 'Luxemburg',
    description:
      'Im Juni 2014 vom Parlament beschlossen, am 17.7.2014 im Amtsblatt veröffentlicht; ' +
      'in Kraft getreten am ersten Tag des sechsten Monats nach Veröffentlichung = 1. Januar 2015.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Luxembourg', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Luxembourg' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'ehe-irland-2015-11-16',
    title: 'Ehe für alle (Irland)',
    date: '2015-11-16',
    country: 'Irland',
    description:
      'Nach dem Referendum am 22.5.2015 (62,07 % Ja) und der Unterzeichnung des Marriage Act 2015 ' +
      'am 29.10.2015 in Kraft getreten am 16. November 2015 (erste Trauung am 17.11.). Erstes Land ' +
      'weltweit, das die Ehe für alle per Volksabstimmung einführte.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in the Republic of Ireland', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_the_Republic_of_Ireland' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-daenemark-1989-10-01',
    title: 'Erste eingetragene Partnerschaft weltweit (Dänemark)',
    date: '1989-10-01',
    country: 'Dänemark',
    description:
      'Dänemark führte als weltweit erstes Land die eingetragene Partnerschaft ein. Gesetz am ' +
      '7.6.1989 beschlossen, in Kraft getreten am 1. Oktober 1989 — die ersten Paare (u. a. ' +
      'Axel und Eigil Axgil) registrierten sich im Kopenhagener Rathaus.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Denmark', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Denmark' },
      { label: 'Wikipedia — LGBTQ rights in Denmark', url: 'https://en.wikipedia.org/wiki/LGBTQ_rights_in_Denmark' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-niederlande-1998-01-01',
    title: 'Eingetragene Partnerschaft (Niederlande)',
    date: '1998-01-01',
    country: 'Niederlande',
    description:
      'Die Niederlande führten am 1. Januar 1998 die eingetragene Partnerschaft ' +
      '(geregistreerd partnerschap) ein — offen für gleich- und verschiedengeschlechtliche ' +
      'Paare, drei Jahre vor der Ehe für alle (2001).',
    sources: [
      { label: 'Wikipedia — Registered partnership in the Netherlands', url: 'https://en.wikipedia.org/wiki/Registered_partnership_in_the_Netherlands' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-deutschland-2001-08-01',
    title: 'Eingetragene Lebenspartnerschaft (Deutschland)',
    date: '2001-08-01',
    country: 'Deutschland',
    description:
      'Das Lebenspartnerschaftsgesetz (LPartG) wurde vom Bundestag am 10.11.2000 beschlossen, ' +
      'von Präsident Johannes Rau am 16.2.2001 unterzeichnet; in Kraft getreten am 1. August 2001 ' +
      '(erste Partnerschaft Reinhard Lüschow & Heinz Friedrich Haar, Hannover).',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Germany', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Germany' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-vereinigtes-koenigreich-2005-12-05',
    title: 'Eingetragene Partnerschaft (Vereinigtes Königreich)',
    date: '2005-12-05',
    country: 'Vereinigtes Königreich',
    description:
      'Civil Partnership Act 2004 (königliche Zustimmung 18.11.2004); UK-weit in Kraft getreten ' +
      'am 5. Dezember 2005. Erste Partnerschaft am 5.12.2005 (Matthew Roche & Christopher Cramp, ' +
      'Worthing); allgemeine Zeremonien folgten nach der Wartefrist ab dem 19.–21.12.2005.',
    sources: [
      { label: 'Wikipedia — Civil partnership in the United Kingdom', url: 'https://en.wikipedia.org/wiki/Civil_partnership_in_the_United_Kingdom' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-norwegen-1993-08-01',
    title: 'Eingetragene Partnerschaft (Norwegen)',
    date: '1993-08-01',
    country: 'Norwegen',
    description:
      'Norwegen führte als weltweit zweites Land (nach Dänemark) die eingetragene Partnerschaft ein. ' +
      'Gesetz (Act No. 40) vom 30.4.1993; in Kraft getreten am 1. August 1993.',
    sources: [
      { label: 'regjeringen.no — Registered Partnership (PDF)', url: 'https://www.regjeringen.no/globalassets/upload/kilde/bfd/bro/2000/0009/ddd/pdfv/292713-partnerskap_internett.pdf' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-schweden-1995-01-01',
    title: 'Eingetragene Partnerschaft (Schweden)',
    date: '1995-01-01',
    country: 'Schweden',
    description:
      'Lag om registrerat partnerskap (SFS 1994:1117), am 23.6.1994 ausgefertigt; in Kraft getreten ' +
      'am 1. Januar 1995.',
    sources: [
      { label: 'Wikipedia — Same-sex marriage in Sweden', url: 'https://en.wikipedia.org/wiki/Same-sex_marriage_in_Sweden' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-frankreich-1999-11-16',
    title: 'PACS — Zivilpakt (Frankreich)',
    date: '1999-11-16',
    country: 'Frankreich',
    description:
      'Der PACS (pacte civil de solidarité, Loi 99-944), am 15.11.1999 verkündet, am 16.11.1999 im ' +
      'Journal officiel veröffentlicht und in Kraft getreten (operative Anwendung nach ' +
      'Durchführungsdekret vom 21.12.1999). Offen für gleich- und verschiedengeschlechtliche Paare.',
    sources: [
      { label: 'Légifrance — LOI n° 99-944 (PACS)', url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000761717' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-andorra-2005-03-24',
    title: 'Eingetragene Partnerschaft (Andorra)',
    date: '2005-03-24',
    country: 'Andorra',
    description:
      'Llei 4/2005 qualificada de les unions estables de parella, vom Consell General am 21.2.2005 ' +
      'beschlossen, am 23.3.2005 im BOPA veröffentlicht; am Folgetag in Kraft getreten = 24. März 2005.',
    sources: [
      { label: 'Consell General — Llei 4/2005 (PDF)', url: 'https://www.consellgeneral.ad/fitxers/documents/lleis-2005/llei-4-2005.pdf/at_download/file' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-irland-2011-01-01',
    title: 'Eingetragene Partnerschaft (Irland)',
    date: '2011-01-01',
    country: 'Irland',
    description:
      'Civil Partnership and Certain Rights and Obligations of Cohabitants Act 2010 (No. 24 of 2010), ' +
      'Enactment am 19.7.2010; per Ministerverordnung (S.I. 648/2010) in Kraft getreten am 1. Januar 2011.',
    sources: [
      { label: 'Irish Statute Book — Act No. 24 of 2010', url: 'https://www.irishstatutebook.ie/eli/2010/act/24/enacted/en/html' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-italien-2016-06-05',
    title: 'Unioni civili — zivile Partnerschaft (Italien)',
    date: '2016-06-05',
    country: 'Italien',
    description:
      'Legge Cirinnà (Gesetz Nr. 76/2016) über die unioni civili für gleichgeschlechtliche Paare, ' +
      'am 21.5.2016 in der Gazzetta Ufficiale veröffentlicht; nach 15 Tagen vacatio legis in Kraft ' +
      'getreten am 5. Juni 2016.',
    sources: [
      { label: 'Gazzetta Ufficiale — Legge 76/2016', url: 'https://www.gazzettaufficiale.it/eli/id/2016/05/21/16G00082/sg' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-montenegro-2020-07-15',
    title: 'Eingetragene Partnerschaft (Montenegro)',
    date: '2020-07-15',
    country: 'Montenegro',
    description:
      'Zakon o životnom partnerstvu — vom Parlament am 1.7.2020 beschlossen, vom Präsidenten am ' +
      '3.7.2020 unterzeichnet; in Kraft getreten am 15. Juli 2020 (Anwendung ab 15.7.2021). ' +
      'Erstes Land des westlichen Balkans mit rechtlicher Anerkennung.',
    sources: [
      { label: 'ILO NATLEX — Law on Life Partnership (PDF)', url: 'https://natlex.ilo.org/dyn/natlex2/natlex2/files/download/116828/MNE-116828.pdf' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-lettland-2024-07-01',
    title: 'Eingetragene Partnerschaft (Lettland)',
    date: '2024-07-01',
    country: 'Lettland',
    description:
      'Partnerschaft per notarieller Beurkundung (Änderung des Notariatsgesetzes), von der Saeima ' +
      'am 9.11.2023 beschlossen; verfügbar/in Kraft ab 1. Juli 2024.',
    sources: [
      { label: 'Justizministerium Lettland (tm.gov.lv)', url: 'https://www.tm.gov.lv/en/article/protecting-everyones-human-rights-and-privacy-1-july-it-will-be-possible-register-partnerships-latvia' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-island-1996-06-27',
    title: 'Eingetragene Partnerschaft (Island)',
    date: '1996-06-27',
    country: 'Island',
    description:
      'Gesetz 87/1996 über die staðfest samvist (bestätigte Lebensgemeinschaft), vom Althing ' +
      'am 4.6.1996 beschlossen; in Kraft getreten am 27. Juni 1996.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Iceland', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Iceland' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-finnland-2002-03-01',
    title: 'Eingetragene Partnerschaft (Finnland)',
    date: '2002-03-01',
    country: 'Finnland',
    description:
      'Gesetz über die rekisteröity parisuhde (registrierte Partnerschaft) für gleichgeschlechtliche ' +
      'Paare; in Kraft getreten am 1. März 2002.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Finland', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Finland' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-luxemburg-2004-11-01',
    title: 'Partenariat — Partnerschaft (Luxemburg)',
    date: '2004-11-01',
    country: 'Luxemburg',
    description:
      'Gesetz über bestimmte Partnerschaften (partenariat), von Großherzog Henri am 9.7.2004 ' +
      'unterzeichnet; in Kraft getreten am 1. November 2004.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Luxembourg', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Luxembourg' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-slowenien-2005-07-23',
    title: 'Registrierte Partnerschaft (Slowenien)',
    date: '2005-07-23',
    country: 'Slowenien',
    description:
      'Zakon o registraciji istospolne partnerske skupnosti (ZRIPS), am 8.7.2005 im Amtsblatt ' +
      'veröffentlicht; in Kraft getreten (uveljavitev) am 23. Juli 2005; Anwendung (uporaba) ab ' +
      '23. Juli 2006.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Slovenia', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Slovenia' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-tschechien-2006-07-01',
    title: 'Registrierte Partnerschaft (Tschechien)',
    date: '2006-07-01',
    country: 'Tschechien',
    description:
      'Zákon o registrovaném partnerství (Gesetz 115/2006 Sb.), im März 2006 beschlossen; ' +
      'in Kraft getreten am 1. Juli 2006.',
    sources: [
      { label: 'Wikipedia — Registered partnership in the Czech Republic', url: 'https://en.wikipedia.org/wiki/Registered_partnership_in_the_Czech_Republic' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-schweiz-2007-01-01',
    title: 'Eingetragene Partnerschaft (Schweiz)',
    date: '2007-01-01',
    country: 'Schweiz',
    description:
      'Bundesgesetz über die eingetragene Partnerschaft (PartG), in der Volksabstimmung 2005 ' +
      'angenommen; in Kraft getreten am 1. Januar 2007. (Später durch die Ehe für alle 2022 abgelöst.)',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Switzerland', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Switzerland' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-ungarn-2009-07-01',
    title: 'Registrierte Partnerschaft (Ungarn)',
    date: '2009-07-01',
    country: 'Ungarn',
    description:
      'Gesetz über die bejegyzett élettársi kapcsolat (registrierte Partnerschaft), von Präsident ' +
      'László Sólyom unterzeichnet; in Kraft getreten am 1. Juli 2009.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Hungary', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Hungary' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-oesterreich-2010-01-01',
    title: 'Eingetragene Partnerschaft (Österreich)',
    date: '2010-01-01',
    country: 'Österreich',
    description:
      'Eingetragene-Partnerschaft-Gesetz (EPG), am 10.12.2009 beschlossen, am 30.12.2009 im ' +
      'Bundesgesetzblatt veröffentlicht; in Kraft getreten am 1. Januar 2010.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Austria', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Austria' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-kroatien-2014-08-05',
    title: 'Lebenspartnerschaft (Kroatien)',
    date: '2014-08-05',
    country: 'Kroatien',
    description:
      'Zakon o životnom partnerstvu osoba istog spola (Life Partnership Act), am 28.7.2014 in den ' +
      'Narodne novine (92/2014) veröffentlicht; nach 8 Tagen in Kraft getreten am 5. August 2014.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Croatia', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Croatia' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-zypern-2015-12-09',
    title: 'Zivile Partnerschaft (Zypern)',
    date: '2015-12-09',
    country: 'Zypern',
    description:
      'Civil Union Law (πολιτική συμβίωση, Gesetz 184(I)/2015), von Präsident Anastasiades ' +
      'unterzeichnet und am 9.12.2015 im Amtsblatt veröffentlicht; am selben Tag in Kraft getreten.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Cyprus', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Cyprus' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-san-marino-2018-12-05',
    title: 'Unione civile — zivile Partnerschaft (San Marino)',
    date: '2018-12-05',
    country: 'San Marino',
    description:
      'Legge 147/2018 (Regolamentazione delle unioni civili); in Kraft getreten am 5. Dezember 2018 ' +
      '(volle Anwendung nach Durchführungsdekret Anfang 2019).',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in San Marino', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_San_Marino' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-belgien-2000-01-01',
    title: 'Gesetzliches Zusammenwohnen (Belgien)',
    date: '2000-01-01',
    country: 'Belgien',
    description:
      'Cohabitation légale / wettelijke samenwoning, Gesetz vom 23.11.1998; per Königlichem Erlass ' +
      'vom 14.12.1999 in Kraft getreten am 1. Januar 2000. Offen für gleich- und ' +
      'verschiedengeschlechtliche Paare.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Belgium', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Belgium' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-neuseeland-2005-04-26',
    title: 'Civil Union (Neuseeland)',
    date: '2005-04-26',
    country: 'Neuseeland',
    description:
      'Civil Union Act 2004; die zivile Partnerschaft wurde am 26. April 2005 wirksam — erste ' +
      'nationale Anerkennung in Ozeanien. (Später durch die Ehe für alle 2013 ergänzt.)',
    sources: [
      { label: 'Wikipedia — Civil Union Act 2004', url: 'https://en.wikipedia.org/wiki/Civil_Union_Act_2004' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-suedafrika-2006-11-30',
    title: 'Civil Union Act (Südafrika)',
    date: '2006-11-30',
    country: 'Südafrika',
    description:
      'Civil Union Act, 2006 — ermöglicht Ehe oder civil partnership für gleichgeschlechtliche Paare; ' +
      'am 29.11.2006 sanktioniert, in Kraft getreten am 30. November 2006. Erstes Land Afrikas mit ' +
      'rechtlicher Anerkennung.',
    sources: [
      { label: 'Wikipedia — Civil Union Act, 2006', url: 'https://en.wikipedia.org/wiki/Civil_Union_Act,_2006' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-kolumbien-2007-02-07',
    title: 'Unión marital de hecho (Kolumbien)',
    date: '2007-02-07',
    country: 'Kolumbien',
    description:
      'Das Verfassungsgericht erkannte am 7. Februar 2007 die unión marital de hecho für ' +
      'gleichgeschlechtliche Paare an — registrierbar per notarieller Urkunde.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Colombia', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Colombia' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-uruguay-2008-01-20',
    title: 'Unión concubinaria (Uruguay)',
    date: '2008-01-20',
    country: 'Uruguay',
    description:
      'Unión concubinaria (Gesetz 18.246), am 10.1.2008 veröffentlicht; in Kraft getreten am ' +
      '20. Januar 2008 (administrative Registrierung, keine gerichtliche Anerkennung nötig).',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Uruguay', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Uruguay' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-brasilien-2011-05-13',
    title: 'União estável (Brasilien)',
    date: '2011-05-13',
    country: 'Brasilien',
    description:
      'Der Oberste Gerichtshof (STF) entschied am 5.5.2011 (ADI 4277 / ADPF 132), dass ' +
      'gleichgeschlechtliche Paare die união estável eintragen können; die Entscheidung wurde am ' +
      '12.5. veröffentlicht und am 13. Mai 2011 wirksam.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Brazil', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Brazil' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-liechtenstein-2011-09-01',
    title: 'Eingetragene Partnerschaft (Liechtenstein)',
    date: '2011-09-01',
    country: 'Liechtenstein',
    description:
      'Gesetz über die eingetragene Partnerschaft, in der Volksabstimmung 2011 mit 68,8 % angenommen; ' +
      'in Kraft getreten am 1. September 2011. (Später durch die Ehe für alle 2025 abgelöst.)',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Liechtenstein', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Liechtenstein' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-argentinien-2015-08-01',
    title: 'Unión convivencial (Argentinien)',
    date: '2015-08-01',
    country: 'Argentinien',
    description:
      'Die registrierbare unión convivencial trat mit dem neuen Código Civil y Comercial landesweit ' +
      'in Kraft am 1. August 2015. (Ehe für alle bereits 2010; Stadt Buenos Aires civil union 2002.)',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Argentina', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Argentina' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-chile-2015-10-22',
    title: 'Acuerdo de Unión Civil (Chile)',
    date: '2015-10-22',
    country: 'Chile',
    description:
      'Acuerdo de Unión Civil (AUC, Gesetz 20.830), am 21.4.2015 veröffentlicht; in Kraft getreten ' +
      'am 22. Oktober 2015 (erste Eintragungen am selben Tag).',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Chile', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Chile' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-griechenland-2015-12-24',
    title: 'Sýmfono symvíosis (Griechenland)',
    date: '2015-12-24',
    country: 'Griechenland',
    description:
      'Sýmfono symvíosis (Vereinbarung über das Zusammenleben) für gleichgeschlechtliche Paare, ' +
      'Gesetz 4356/2015; am 24.12.2015 im Regierungsanzeiger veröffentlicht und mit der ' +
      'Veröffentlichung in Kraft getreten.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Greece', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Greece' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-estland-2016-01-01',
    title: 'Kooseluseadus — Lebensgemeinschaft (Estland)',
    date: '2016-01-01',
    country: 'Estland',
    description:
      'Kooseluseadus (Gesetz über die eingetragene Lebensgemeinschaft), am 9.10.2015 beschlossen; ' +
      'in Kraft getreten am 1. Januar 2016 — erstes Land des ehemaligen Ostblocks mit einer solchen ' +
      'Regelung.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Estonia', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Estonia' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-ecuador-2014-09-15',
    title: 'Unión de hecho (Ecuador)',
    date: '2014-09-15',
    country: 'Ecuador',
    description:
      'Die unión de hecho für gleichgeschlechtliche Paare war seit der Verfassung 2008 vorgesehen; ' +
      'die landesweite Eintragung im Zivilstandsregister begann am 15. September 2014 (gesetzliche ' +
      'Kodifizierung 2015).',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Ecuador', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Ecuador' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-monaco-2020-06-27',
    title: 'Contrat civil de solidarité (Monaco)',
    date: '2020-06-27',
    country: 'Monaco',
    description:
      'Contrat civil de solidarité (Loi n° 1.481), von Fürst Albert II. am 17.12.2019 unterzeichnet, ' +
      'am 27.12.2019 im Amtsblatt veröffentlicht; sechs Monate später in Kraft getreten am ' +
      '27. Juni 2020.',
    sources: [
      { label: 'Wikipedia — Recognition of same-sex unions in Monaco', url: 'https://en.wikipedia.org/wiki/Recognition_of_same-sex_unions_in_Monaco' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-portugal-2001-05-16',
    title: 'União de facto (Portugal)',
    date: '2001-05-16',
    country: 'Portugal',
    description:
      'Lei 7/2001 (Schutz der uniões de facto, auch gleichgeschlechtlich), am 11.5.2001 im Diário ' +
      'da República veröffentlicht. Das Gesetz setzt kein eigenes Datum; nach der allgemeinen ' +
      'Vacatio-legis-Regel (5. Tag nach Veröffentlichung) in Kraft getreten am 16. Mai 2001. ' +
      '(Abgeleitetes Datum — kein Tagesdatum im Gesetzestext.)',
    sources: [
      { label: 'Diário da República — Lei 7/2001', url: 'https://diariodarepublica.pt/dr/detalhe/lei/7-2001-314194' },
      { label: 'PGDL — Lei 7/2001', url: 'https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=901&tabela=leis' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'partnerschaft-malta-2014-04-14',
    title: 'Civil Unions Act (Malta)',
    date: '2014-04-14',
    country: 'Malta',
    description:
      'Civil Unions Act (Kapitel 530 der Gesetze Maltas). Das offizielle Gesetzesportal ' +
      'legislation.mt führt als Inkrafttreten (Data ta’ dħul fis-seħħ) den 14. April 2014 ' +
      '(Datum der Verabschiedung im Parlament); vom Präsidenten am 16.4. unterzeichnet, erste ' +
      'zivile Partnerschaft am 13.6.2014.',
    sources: [
      { label: 'legislation.mt — Civil Unions Act, Cap. 530', url: 'https://legislation.mt/eli/cap/530/eng' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
]

// Trans-Rechte — Depathologisierung + rechtliche Geschlechtsanerkennung/
// Selbstbestimmung. Tagesgenau, quellengeprüft (Deep-Research 3-0 + Direkt-Fetch).
// Malta (GIGESC, nur April 2015) und Niederlande (nur Jahr) bewusst weggelassen.
const transSeed: Milestone[] = [
  {
    id: 'trans-schweden-1972-04-21',
    title: 'Weltweit erstes Gesetz zur Geschlechtsanerkennung (Schweden)',
    date: '1972-04-21',
    country: 'Schweden',
    description:
      'Lag (1972:119) om fastställande av könstillhörighet — weltweit erstes Gesetz, das eine ' +
      'rechtliche Änderung der Geschlechtszugehörigkeit ermöglichte (ausgefertigt am 21. April 1972). ' +
      'Damals noch an Bedingungen wie Sterilisation geknüpft.',
    sources: [
      { label: 'Riksdagen — SFS 1972:119', url: 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-1972119-om-faststallande-av_sfs-1972-119/' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-uk-2005-04-04',
    title: 'Gender Recognition Act 2004 (Vereinigtes Königreich)',
    date: '2005-04-04',
    country: 'Vereinigtes Königreich',
    description:
      'Der Gender Recognition Act 2004 ermöglichte die rechtliche Anerkennung des Geschlechts ' +
      '(Gender Recognition Certificate); in Kraft getreten am 4. April 2005.',
    sources: [
      { label: 'Wikipedia — Gender Recognition Act 2004', url: 'https://en.wikipedia.org/wiki/Gender_Recognition_Act_2004' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-argentinien-2012-05-24',
    title: 'Ley de Identidad de Género (Argentinien)',
    date: '2012-05-24',
    country: 'Argentinien',
    description:
      'Ley 26.743 de Identidad de Género — weltweit erstes reines Selbstbestimmungsgesetz ' +
      '(Änderung des Geschlechtseintrags ohne medizinische oder gerichtliche Auflagen). Sanktioniert ' +
      'am 9.5., verkündet am 23.5., im Boletín Oficial veröffentlicht am 24. Mai 2012.',
    sources: [
      { label: 'Boletín Oficial — Ley 26.743', url: 'https://www.boletinoficial.gob.ar/detalleAviso/primera/70106/20120524' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-daenemark-2014-09-01',
    title: 'Rechtliche Selbstbestimmung (Dänemark)',
    date: '2014-09-01',
    country: 'Dänemark',
    description:
      'Dänemark ermöglichte als erstes Land Europas die Änderung des rechtlichen Geschlechts per ' +
      'Selbsterklärung (ohne Diagnose, Sterilisation oder Operation), mit sechsmonatiger ' +
      'Bedenkzeit; in Kraft getreten am 1. September 2014.',
    sources: [
      { label: 'Wikipedia — Transgender rights in Denmark', url: 'https://en.wikipedia.org/wiki/Transgender_rights_in_Denmark' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-irland-2015-07-15',
    title: 'Gender Recognition Act 2015 (Irland)',
    date: '2015-07-15',
    country: 'Irland',
    description:
      'Der Gender Recognition Act 2015 führte die rechtliche Geschlechtsanerkennung per ' +
      'Selbstbestimmung ein; am 15. Juli 2015 vom Oireachtas verabschiedet (Inkrafttreten per ' +
      'Ministerverordnung im September 2015).',
    sources: [
      { label: 'Wikipedia — Gender Recognition Act 2015', url: 'https://en.wikipedia.org/wiki/Gender_Recognition_Act_2015' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-norwegen-2016-07-01',
    title: 'Rechtliche Selbstbestimmung (Norwegen)',
    date: '2016-07-01',
    country: 'Norwegen',
    description:
      'Norwegen führte die Änderung des rechtlichen Geschlechts per Selbstbestimmung ein; ' +
      'verkündet am 17.6., in Kraft getreten am 1. Juli 2016.',
    sources: [
      { label: 'Wikipedia — Transgender rights in Norway', url: 'https://en.wikipedia.org/wiki/Transgender_rights_in_Norway' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-icd11-2022-01-01',
    title: 'WHO ICD-11: Entpathologisierung von Trans-Identitäten',
    date: '2022-01-01',
    country: '',
    description:
      'Mit der ICD-11 verschob die WHO „Geschlechtsinkongruenz" aus dem Kapitel der psychischen ' +
      'Störungen in ein neues Kapitel zur sexuellen Gesundheit — ein Meilenstein der ' +
      'Entpathologisierung. Von der Weltgesundheitsversammlung am 25.5.2019 angenommen, in Kraft ' +
      'getreten am 1. Januar 2022. (Pendant zur Streichung der Homosexualität 1990.)',
    sources: [
      { label: 'WHO — ICD-11 comes into effect (2022)', url: 'https://www.who.int/news/item/11-02-2022-who-s-new-international-classification-of-diseases-(icd-11)-comes-into-effect' },
      { label: 'WHO — Gender incongruence FAQ', url: 'https://www.who.int/standards/classifications/frequently-asked-questions/gender-incongruence-and-transgender-health-in-the-icd' },
    ],
    linked_persons: [],
    category: 'Entpathologisierung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-spanien-2023-03-02',
    title: 'Ley Trans (Spanien)',
    date: '2023-03-02',
    country: 'Spanien',
    description:
      'Ley 4/2023 („Ley Trans") — Geschlechtsanerkennung per Selbstbestimmung, ohne ärztliches oder ' +
      'psychologisches Gutachten. Am 28.2. beschlossen, am 1.3. im BOE veröffentlicht, in Kraft ' +
      'getreten am 2. März 2023.',
    sources: [
      { label: 'BOE — Ley 4/2023', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-5366' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-deutschland-2024-11-01',
    title: 'Selbstbestimmungsgesetz (Deutschland)',
    date: '2024-11-01',
    country: 'Deutschland',
    description:
      'Das Selbstbestimmungsgesetz (SBGG) löste das Transsexuellengesetz ab: Änderung von ' +
      'Geschlechtseintrag und Vornamen per Erklärung beim Standesamt. Vom Bundestag am 12.4.2024 ' +
      'beschlossen; in Kraft getreten am 1. November 2024.',
    sources: [
      { label: 'Wikipedia — Transgender rights in Germany', url: 'https://en.wikipedia.org/wiki/Transgender_rights_in_Germany' },
      { label: 'gesetze-im-internet — SBGG', url: 'https://www.gesetze-im-internet.de/sbgg/' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-niederlande-2014-07-01',
    title: 'Transgenderwet (Niederlande)',
    date: '2014-07-01',
    country: 'Niederlande',
    description:
      'Transgenderwet (Gesetz vom 18.12.2013 zur Änderung von Buch 1 des Bürgerlichen Gesetzbuchs): ' +
      'Änderung des Geschlechtseintrags ohne Sterilisation oder Operation; in Kraft getreten am ' +
      '1. Juli 2014.',
    sources: [
      { label: 'Wikipedia (nl) — Transgenderwet (Nederland)', url: 'https://nl.wikipedia.org/wiki/Transgenderwet_(Nederland)' },
      { label: 'Staatsblad 2014, 222', url: 'https://zoek.officielebekendmakingen.nl/stb-2014-222.html' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'trans-malta-2015-04-14',
    title: 'GIGESC Act (Malta)',
    date: '2015-04-14',
    country: 'Malta',
    description:
      'Gender Identity, Gender Expression and Sex Characteristics Act (GIGESC, Kapitel 540): ' +
      'Geschlechtsanerkennung per Selbstbestimmung plus weltweit wegweisender Schutz von ' +
      'Geschlechtsmerkmalen (Intersex). Laut offiziellem Gesetzesportal legislation.mt in Kraft ' +
      'getreten am 14. April 2015.',
    sources: [
      { label: 'legislation.mt — GIGESC Act, Cap. 540', url: 'https://legislation.mt/eli/cap/540/eng' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 4,
    impact: 'positive',
    checked: false,
  },
]

// Repression / Rückschritt (negativ) + DSM-Depathologisierung (positiv).
// Tagesgenau, quellengeprüft (Deep-Research 3-0; Russland-2013 „medium",
// Datum 30.6. = Veröffentlichung/Inkrafttreten). Ungarn 2021 ausgelassen
// (kein belegtes Tagesdatum).
const repressionSeed: Milestone[] = [
  {
    id: 'dsm-entpathologisierung-1973-12-15',
    title: 'APA streicht Homosexualität aus dem DSM',
    date: '1973-12-15',
    country: 'USA',
    description:
      'Das Board of Trustees der American Psychiatric Association strich am 15. Dezember 1973 ' +
      'Homosexualität aus dem Diagnosehandbuch DSM-II. Eine Mitgliederabstimmung bestätigte 1974 ' +
      'die Entscheidung. Meilenstein der Entpathologisierung (Pendant zur WHO-Streichung 1990).',
    sources: [
      { label: 'History.com — APA removes homosexuality (15.12.1973)', url: 'https://www.history.com/this-day-in-history/december-15/the-american-psychiatric-association-removes-homosexuality-from-its-list-of-mental-illnesses' },
      { label: 'NCBI/PMC — Homosexuality & the DSM', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4695779/' },
    ],
    linked_persons: [],
    category: 'Entpathologisierung',
    significance: 5,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'section28-einfuehrung-1988-05-24',
    title: 'Section 28 tritt in Kraft (Vereinigtes Königreich)',
    date: '1988-05-24',
    country: 'Vereinigtes Königreich',
    description:
      'Section 28 des Local Government Act 1988 verbot Kommunen die „Förderung von Homosexualität" ' +
      '(u. a. an Schulen). Königliche Zustimmung am 24.3., in Kraft getreten am 24. Mai 1988 ' +
      '(Regierung Thatcher). Prägte ein Klima des Schweigens an Schulen.',
    sources: [
      { label: 'legislation.gov.uk — Local Government Act 1988, s.28', url: 'https://www.legislation.gov.uk/ukpga/1988/9/section/28' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 4,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'section28-abschaffung-schottland-2001-03-29',
    title: 'Section 28 abgeschafft (Schottland)',
    date: '2001-03-29',
    country: 'Vereinigtes Königreich',
    region: 'Schottland',
    description:
      'Schottland hob Section 28 mit Wirkung zum 29. März 2001 auf (Ethical Standards in Public ' +
      'Life etc. (Scotland) Act 2000) — noch vor England & Wales.',
    sources: [
      { label: 'legislation.gov.uk — asp 2000/7', url: 'https://www.legislation.gov.uk/asp/2000/7/contents' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'section28-abschaffung-england-wales-2003-11-18',
    title: 'Section 28 abgeschafft (England & Wales)',
    date: '2003-11-18',
    country: 'Vereinigtes Königreich',
    region: 'England & Wales',
    description:
      'England & Wales hoben Section 28 mit Wirkung zum 18. November 2003 auf (Local Government ' +
      'Act 2003; königliche Zustimmung 18.9.2003).',
    sources: [
      { label: 'legislation.gov.uk — Local Government Act 1988, s.28 (Aufhebungsvermerk)', url: 'https://www.legislation.gov.uk/ukpga/1988/9/section/28' },
      { label: 'House of Commons Library — 20th anniversary of repeal', url: 'https://commonslibrary.parliament.uk/research-briefings/cdp-2023-0213/' },
    ],
    linked_persons: [],
    category: 'Gesetz / Gleichstellung',
    significance: 3,
    impact: 'positive',
    checked: false,
  },
  {
    id: 'nigeria-ssmpa-2014-01-07',
    title: 'Same-Sex Marriage (Prohibition) Act (Nigeria)',
    date: '2014-01-07',
    country: 'Nigeria',
    description:
      'Von Präsident Goodluck Jonathan am 7. Januar 2014 unterzeichnet (Commencement selben Tag). ' +
      'Verbietet gleichgeschlechtliche Ehen, Vereinigungen und deren öffentliche „Unterstützung" ' +
      'unter hoher Strafandrohung.',
    sources: [
      { label: 'Wikipedia — Same Sex Marriage (Prohibition) Act, 2013', url: 'https://en.wikipedia.org/wiki/Same_Sex_Marriage_(Prohibition)_Act,_2013' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 3,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'russland-propaganda-2013-06-30',
    title: '„Propaganda"-Gesetz (Russland)',
    date: '2013-06-30',
    country: 'Russland',
    description:
      'Föderales Gesetz Nr. 135-FZ („Propaganda nichttraditioneller sexueller Beziehungen unter ' +
      'Minderjährigen"), von Präsident Putin am 29.6. unterzeichnet, mit Veröffentlichung am ' +
      '30. Juni 2013 in Kraft getreten. Grundlage massiver Repression (2022 auf Erwachsene ausgeweitet).',
    sources: [
      { label: 'Wikipedia — Russian anti-LGBTQ law', url: 'https://en.wikipedia.org/wiki/Russian_anti-LGBTQ_law' },
      { label: 'Human Rights Campaign', url: 'https://www.hrc.org/press/putins-anti-lgbt-law-turns-one' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 4,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'uganda-anti-homosexuality-2023-05-30',
    title: 'Anti-Homosexuality Act 2023 (Uganda)',
    date: '2023-05-30',
    country: 'Uganda',
    description:
      'Von Präsident Museveni am 26.5. unterzeichnet, am 30. Mai 2023 mit Veröffentlichung im ' +
      'Gazette in Kraft getreten. Eines der weltweit härtesten Gesetze — sieht u. a. die Todesstrafe ' +
      'für „schwere Homosexualität" vor.',
    sources: [
      { label: 'Wikipedia — Anti-Homosexuality Act, 2023', url: 'https://en.wikipedia.org/wiki/Anti-Homosexuality_Act,_2023' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 4,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'russland-lgbt-extremismus-2023-11-30',
    title: '„LGBT-Bewegung" für extremistisch erklärt (Russland)',
    date: '2023-11-30',
    country: 'Russland',
    description:
      'Das Oberste Gericht Russlands erklärte am 30. November 2023 die „internationale LGBT-Bewegung" ' +
      'für extremistisch (Rechtskraft 10.1.2024) — faktisches Verbot queerer Organisation und ' +
      'Aktivität, mit strafrechtlichen Folgen.',
    sources: [
      { label: 'Wikipedia — Russian anti-LGBTQ law', url: 'https://en.wikipedia.org/wiki/Russian_anti-LGBTQ_law' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 4,
    impact: 'negative',
    checked: false,
  },
]

// Globale Rückschritte 2022–2024 (außerhalb Europas/Russlands). Tagesgenau,
// gegen HRW/Al Jazeera/Library of Congress bzw. Wikipedia geprüft. Milestone-Datum
// = Parlamentsbeschluss (Inkrafttreten separat vermerkt).
const worldRepressionSeed: Milestone[] = [
  {
    id: 'indonesien-kuhp-2022-12-06',
    title: 'Neues Strafgesetzbuch (KUHP) — Indonesien',
    date: '2022-12-06',
    country: 'Indonesien',
    description:
      'Am 6. Dezember 2022 verabschiedete das Parlament (DPR) einstimmig das neue Strafgesetzbuch ' +
      '(Gesetz Nr. 1/2023). Es stellt Sex außerhalb der Ehe und Zusammenleben unter Strafe — trifft ' +
      'gleichgeschlechtliche Paare faktisch, da gleichgeschlechtliche Ehe nicht möglich ist. ' +
      'Inkrafttreten am 2. Januar 2026.',
    sources: [
      { label: 'Al Jazeera', url: 'https://www.aljazeera.com/news/2022/12/6/indonesia-passes-legislation-outlawing-sex-outside-marriage' },
      { label: 'Human Rights Watch', url: 'https://www.hrw.org/news/2022/12/08/indonesia-new-criminal-code-disastrous-rights' },
      { label: 'Library of Congress', url: 'https://www.loc.gov/item/global-legal-monitor/2022-12-11/indonesia-new-criminal-code-passed-by-parliament/' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 4,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'ghana-family-values-2024-02-28',
    title: 'Human Sexual Rights and Family Values Bill — Ghana',
    date: '2024-02-28',
    country: 'Ghana',
    description:
      'Am 28. Februar 2024 nahm das Parlament das „Family Values"-Gesetz einstimmig an — bis zu ' +
      '3 Jahre Haft für Identifizierung als LGBTQ, bis zu 5 Jahre für „Förderung". Der Entwurf ' +
      'verfiel vor der Wahl 2024, wurde 2025 erneut eingebracht und 2026 wieder beschlossen; ' +
      'bislang NICHT vom Präsidenten unterzeichnet — noch nicht in Kraft.',
    sources: [
      { label: 'Wikipedia — Human Sexual Rights and Family Values Bill', url: 'https://en.wikipedia.org/wiki/Human_Sexual_Rights_and_Family_Values_Bill' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 3,
    impact: 'negative',
    checked: false,
  },
  {
    id: 'irak-anti-lgbt-2024-04-27',
    title: 'Gesetz gegen gleichgeschlechtliche Beziehungen — Irak',
    date: '2024-04-27',
    country: 'Irak',
    description:
      'Am 27. April 2024 beschloss das irakische Parlament eine Änderung des Anti-Prostitutions-' +
      'Gesetzes, die einvernehmliche gleichgeschlechtliche Beziehungen mit bis zu 15 Jahren Haft ' +
      'und Trans-Sein mit bis zu 3 Jahren bestraft.',
    sources: [
      { label: 'Wikipedia — LGBT rights in Iraq', url: 'https://en.wikipedia.org/wiki/LGBT_rights_in_Iraq' },
    ],
    linked_persons: [],
    category: 'Recht / Kriminalisierung',
    significance: 4,
    impact: 'negative',
    checked: false,
  },
]

const SEED: Milestone[] = [...BASE_SEED, ...decrimSeed, ...unionSeed, ...transSeed, ...repressionSeed, ...worldRepressionSeed]

const KEY = 'person-db.milestones.v2'

function readAll(): Milestone[] {
  const raw = localStorage.getItem(KEY)
  if (!raw) {
    localStorage.setItem(KEY, JSON.stringify(SEED))
    return [...SEED]
  }
  let list: Milestone[]
  try {
    list = JSON.parse(raw) as Milestone[]
  } catch {
    return [...SEED]
  }
  const seedIds = new Set(SEED.map((s) => s.id))
  // SEED is the source of truth for seeded entries' content (dates, text, sources),
  // but the user's local `checked` flag AND person links must survive the refresh.
  // Purely user-created milestones (ids not in SEED) are kept as-is; stale
  // auto-seeded rows fall away.
  const storedById = new Map(list.map((m) => [m.id, m]))
  const userEntries = list.filter((m) => !seedIds.has(m.id) && !m.id.startsWith('decrim-'))
  const seeded = SEED.map((s) => {
    const prev = storedById.get(s.id)
    // Seed links (with their roles) win for their slugs; user-added links for
    // other persons are appended and preserved.
    const seedSlugs = new Set(s.linked_persons.map((p) => p.slug))
    const extra = (prev?.linked_persons ?? []).filter((p) => !seedSlugs.has(p.slug))
    return {
      ...s,
      checked: prev?.checked ?? s.checked,
      linked_persons: [...s.linked_persons, ...extra],
    }
  })
  const next = [...seeded, ...userEntries]
  writeAll(next)
  return next
}
function writeAll(list: Milestone[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function getMilestones(): Milestone[] {
  return readAll()
}

export function getMilestone(id: string): Milestone | undefined {
  return readAll().find((m) => m.id === id)
}

// Upsert by id. Returns the saved list.
export function saveMilestone(m: Milestone): Milestone[] {
  const list = readAll()
  const i = list.findIndex((x) => x.id === m.id)
  if (i >= 0) list[i] = m
  else list.push(m)
  writeAll(list)
  return list
}

export function deleteMilestone(id: string): Milestone[] {
  const list = readAll().filter((m) => m.id !== id)
  writeAll(list)
  return list
}

// --- person ↔ milestone linking (from the person side) ---
export function milestonesForPerson(slug: string): Milestone[] {
  return readAll().filter((m) => m.linked_persons.some((p) => p.slug === slug))
}

export function linkPersonToMilestone(milestoneId: string, person: LinkedPerson): void {
  const list = readAll()
  const m = list.find((x) => x.id === milestoneId)
  if (m && !m.linked_persons.some((p) => p.slug === person.slug)) {
    m.linked_persons = [...m.linked_persons, person]
    writeAll(list)
  }
}

export function unlinkPersonFromMilestone(milestoneId: string, slug: string): void {
  const list = readAll()
  const m = list.find((x) => x.id === milestoneId)
  if (m) {
    m.linked_persons = m.linked_persons.filter((p) => p.slug !== slug)
    writeAll(list)
  }
}

export function toggleMilestoneChecked(id: string): Milestone[] {
  const list = readAll()
  const m = list.find((x) => x.id === id)
  if (m) m.checked = !m.checked
  writeAll(list)
  return list
}

// Slug-ish id from a title (+ short random-free suffix via title length).
export function makeMilestoneId(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return base || `milestone-${title.length}`
}

export function emptyMilestone(): Milestone {
  return {
    id: '',
    title: '',
    date: '',
    description: '',
    sources: [],
    linked_persons: [],
    significance: 3,
    impact: 'neutral',
    checked: false,
  }
}
