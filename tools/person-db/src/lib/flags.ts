// Country name → emoji flag. Covers the English nationality strings used in
// `personalities` + common German country names. Unknown → '' (graceful).

export function codeToFlag(cc: string): string {
  if (!cc || cc.length !== 2) return ''
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

// lowercase name / alias → ISO 3166-1 alpha-2
const NAME_TO_CC: Record<string, string> = {
  // English
  'united states': 'US', 'united states of america': 'US', usa: 'US', 'u.s.': 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  germany: 'DE', deutschland: 'DE',
  france: 'FR', frankreich: 'FR',
  spain: 'ES', spanien: 'ES',
  italy: 'IT', italien: 'IT',
  netherlands: 'NL', niederlande: 'NL', holland: 'NL',
  belgium: 'BE', belgien: 'BE',
  switzerland: 'CH', schweiz: 'CH',
  austria: 'AT', österreich: 'AT', oesterreich: 'AT',
  ireland: 'IE', irland: 'IE',
  portugal: 'PT',
  sweden: 'SE', schweden: 'SE',
  norway: 'NO', norwegen: 'NO',
  denmark: 'DK', dänemark: 'DK', daenemark: 'DK',
  finland: 'FI', finnland: 'FI',
  iceland: 'IS', island: 'IS',
  poland: 'PL', polen: 'PL',
  'czech republic': 'CZ', czechia: 'CZ', tschechien: 'CZ',
  hungary: 'HU', ungarn: 'HU',
  greece: 'GR', griechenland: 'GR',
  russia: 'RU', russland: 'RU',
  ukraine: 'UA',
  romania: 'RO', rumänien: 'RO',
  turkey: 'TR', türkei: 'TR', tuerkei: 'TR',
  canada: 'CA', kanada: 'CA',
  mexico: 'MX', mexiko: 'MX',
  brazil: 'BR', brasilien: 'BR',
  argentina: 'AR', argentinien: 'AR',
  chile: 'CL',
  colombia: 'CO', kolumbien: 'CO',
  peru: 'PE',
  cuba: 'CU', kuba: 'CU',
  australia: 'AU', australien: 'AU',
  'new zealand': 'NZ', neuseeland: 'NZ',
  japan: 'JP',
  china: 'CN',
  india: 'IN', indien: 'IN',
  'south korea': 'KR', südkorea: 'KR', suedkorea: 'KR',
  thailand: 'TH',
  philippines: 'PH', philippinen: 'PH',
  indonesia: 'ID', indonesien: 'ID',
  vietnam: 'VN',
  'south africa': 'ZA', südafrika: 'ZA', suedafrika: 'ZA',
  nigeria: 'NG',
  kenya: 'KE', kenia: 'KE',
  egypt: 'EG', ägypten: 'EG', aegypten: 'EG',
  morocco: 'MA', marokko: 'MA',
  israel: 'IL',
  iran: 'IR',
  iraq: 'IQ', irak: 'IQ',
  'saudi arabia': 'SA', 'saudi-arabien': 'SA',
  uganda: 'UG',
  'united arab emirates': 'AE',
  taiwan: 'TW',
  'hong kong': 'HK', hongkong: 'HK',
  singapore: 'SG', singapur: 'SG',
  croatia: 'HR', kroatien: 'HR',
  serbia: 'RS', serbien: 'RS',
  slovenia: 'SI', slowenien: 'SI',
  slovakia: 'SK', slowakei: 'SK',
  bulgaria: 'BG', bulgarien: 'BG',
  lithuania: 'LT', litauen: 'LT',
  latvia: 'LV', lettland: 'LV',
  estonia: 'EE', estland: 'EE',
  luxembourg: 'LU', luxemburg: 'LU',
  malta: 'MT',
  cyprus: 'CY', zypern: 'CY',
  monaco: 'MC',
  andorra: 'AD',
  liechtenstein: 'LI',
  'san marino': 'SM',
  montenegro: 'ME',
  'north macedonia': 'MK', nordmazedonien: 'MK', mazedonien: 'MK',
  moldova: 'MD', moldau: 'MD', moldawien: 'MD',
  belarus: 'BY', weißrussland: 'BY', weissrussland: 'BY',
  albania: 'AL', albanien: 'AL',
  'bosnia and herzegovina': 'BA', 'bosnien und herzegowina': 'BA', bosnien: 'BA',
  kosovo: 'XK',
  georgia: 'GE', georgien: 'GE',
  armenia: 'AM', armenien: 'AM',
  azerbaijan: 'AZ', aserbaidschan: 'AZ',
  'vereinigtes königreich': 'GB', schottland: 'GB', nordirland: 'GB',
}

export function nameToAlpha2(name?: string | null): string {
  if (!name) return ''
  return NAME_TO_CC[name.trim().toLowerCase()] ?? ''
}

export function countryFlag(name?: string | null): string {
  const cc = nameToAlpha2(name)
  return cc ? codeToFlag(cc) : ''
}

// "Deutschland" -> "🇩🇪 Deutschland" (flag only if known)
export function withFlag(name?: string | null): string {
  if (!name) return ''
  const f = countryFlag(name)
  return f ? `${f} ${name}` : name
}
