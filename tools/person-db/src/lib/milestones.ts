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
]

const SEED: Milestone[] = [...BASE_SEED, ...decrimSeed, ...unionSeed]

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
