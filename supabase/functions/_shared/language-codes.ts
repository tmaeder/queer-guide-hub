// English language name (as stored in `countries.languages`) -> the language
// code Wikidata uses for labels and monolingual text.
//
// `countries.languages` is an ordered text[] of ENGLISH names (["Dutch",
// "French", "German"] for Belgium), filled by the country-facts backfill from
// mledoze/countries. Nothing in the schema carries the code, and a city's
// native name is only addressable on Wikidata by code, so this table is the
// bridge.
//
// Every name present in `countries.languages` on 2026-10-06 is listed (127
// distinct values). A name that is NOT listed resolves to null and the caller
// counts it as `unmapped` rather than guessing: an unmapped language costs a
// missing name_local, a wrong code would publish a label in another language
// as the "local" name.
//
// Codes follow Wikidata's label languages, which is why Filipino maps to 'tl'
// (Wikidata labels Tagalog/Filipino under tl) and both Mandarin and Chinese map
// to 'zh'.

export const LANGUAGE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  Afrikaans: 'af', Albanian: 'sq', Amharic: 'am', Arabic: 'ar', Armenian: 'hy',
  Aymara: 'ay', Azerbaijani: 'az', Belarusian: 'be', Bengali: 'bn', Berber: 'ber',
  Bislama: 'bi', Bosnian: 'bs', Bulgarian: 'bg', Burmese: 'my', Carolinian: 'cal',
  Catalan: 'ca', Chamorro: 'ch', Chichewa: 'ny', Chinese: 'zh', Comorian: 'zdj',
  'Cook Islands Māori': 'rar', Croatian: 'hr', Czech: 'cs', Danish: 'da', Dari: 'prs',
  Dhivehi: 'dv', Dutch: 'nl', Dzongkha: 'dz', English: 'en', Estonian: 'et',
  Faroese: 'fo', Fijian: 'fj', Filipino: 'tl', Finnish: 'fi', French: 'fr',
  Georgian: 'ka', German: 'de', Gilbertese: 'gil', Greek: 'el', Greenlandic: 'kl',
  Guaraní: 'gn', Guernésiais: 'nrf', 'Haitian Creole': 'ht', Hassaniya: 'mey',
  Hebrew: 'he', 'Hiri Motu': 'ho', Hindi: 'hi', Hungarian: 'hu', Icelandic: 'is',
  Indonesian: 'id', Irish: 'ga', Italian: 'it', Japanese: 'ja', Jèrriais: 'nrf',
  Kazakh: 'kk', Khmer: 'km', Kinyarwanda: 'rw', Kirundi: 'rn', Korean: 'ko',
  Kurdish: 'ku', Kyrgyz: 'ky', Lao: 'lo', Latin: 'la', Latvian: 'lv',
  Lithuanian: 'lt', Luxembourgish: 'lb', Macedonian: 'mk', Malagasy: 'mg', Malay: 'ms',
  Maltese: 'mt', Mandarin: 'zh', Manx: 'gv', Marshallese: 'mh', Māori: 'mi',
  Mongolian: 'mn', Montenegrin: 'cnr', Nauruan: 'na', Ndebele: 'nd', Nepali: 'ne',
  Niuean: 'niu', Norfuk: 'pih', Norwegian: 'nb', Palauan: 'pau', Papiamento: 'pap',
  Pashto: 'ps', Persian: 'fa', Polish: 'pl', Portuguese: 'pt', Quechua: 'qu',
  Romanian: 'ro', Romansh: 'rm', Russian: 'ru', Samoan: 'sm', Sango: 'sg',
  Serbian: 'sr', Sesotho: 'st', 'Seychellois Creole': 'crs', Shona: 'sn', Sinhala: 'si',
  Slovak: 'sk', Slovene: 'sl', Somali: 'so', Spanish: 'es', Swahili: 'sw',
  Swati: 'ss', Swedish: 'sv', Tajik: 'tg', Tamil: 'ta', Tetum: 'tet',
  Thai: 'th', Tigrinya: 'ti', 'Tok Pisin': 'tpi', Tokelauan: 'tkl', Tongan: 'to',
  Tswana: 'tn', Turkish: 'tr', Turkmen: 'tk', Tuvaluan: 'tvl', Ukrainian: 'uk',
  Urdu: 'ur', Uzbek: 'uz', Vietnamese: 'vi', Xhosa: 'xh', Zulu: 'zu',
}

/**
 * Codes for a country's languages, in the country's own order, de-duplicated.
 * `unmapped` names what could not be resolved so a run can report it.
 */
export function countryLanguageCodes(names: readonly string[] | null | undefined): {
  codes: string[]
  unmapped: string[]
} {
  const codes: string[] = []
  const unmapped: string[] = []
  for (const raw of names ?? []) {
    const name = typeof raw === 'string' ? raw.trim() : ''
    if (!name) continue
    const code = LANGUAGE_NAME_TO_CODE[name]
    if (!code) { unmapped.push(name); continue }
    if (!codes.includes(code)) codes.push(code)
  }
  return { codes, unmapped }
}
