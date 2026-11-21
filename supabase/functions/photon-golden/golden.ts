// The fixed golden set for Photon rollout checks: Swiss addresses, top cities,
// ambiguous names, typos, non-Latin scripts and reverse points. Imported by
// photon-golden (edge) and by the local comparison script, so both ask the
// same questions.
import type { PhotonEndpoint } from '../_shared/photon-client.ts'

export type Probe = { label: string; endpoint: PhotonEndpoint; params: Record<string, string> }
const s = (label: string, q: string, extra: Record<string, string> = {}): Probe =>
  ({ label, endpoint: 'api', params: { q, limit: '5', ...extra } })
const r = (label: string, lat: number, lon: number, lang = 'en'): Probe =>
  ({ label, endpoint: 'reverse', params: { lat: String(lat), lon: String(lon), lang } })

export const GOLDEN: Probe[] = [
  // Swiss addresses
  s('ch-langstrasse', 'Langstrasse 145, Zürich', { lang: 'de' }),
  s('ch-bahnhofstrasse', 'Bahnhofstrasse 1, 8001 Zürich', { lang: 'de' }),
  s('ch-bern-bundesplatz', 'Bundesplatz 3, Bern', { lang: 'de' }),
  s('ch-geneva-rue', 'Rue du Rhône 42, Genève', { lang: 'fr' }),
  s('ch-lausanne', 'Avenue de la Gare 10, Lausanne', { lang: 'fr' }),
  s('ch-lugano', 'Via Nassa 5, Lugano', { lang: 'it' }),
  s('ch-basel', 'Steinenvorstadt 30, Basel', { lang: 'de' }),
  s('ch-postcode', '8004 Zürich', { lang: 'de' }),
  // Top cities
  s('city-berlin', 'Berlin', { lang: 'en' }),
  s('city-london', 'London', { lang: 'en' }),
  s('city-paris', 'Paris', { lang: 'fr' }),
  s('city-amsterdam', 'Amsterdam', { lang: 'en' }),
  s('city-barcelona', 'Barcelona', { lang: 'en' }),
  s('city-madrid', 'Madrid', { lang: 'en' }),
  s('city-new-york', 'New York', { lang: 'en' }),
  s('city-san-francisco', 'San Francisco', { lang: 'en' }),
  s('city-tel-aviv', 'Tel Aviv', { lang: 'en' }),
  s('city-bangkok', 'Bangkok', { lang: 'en' }),
  s('city-sao-paulo', 'São Paulo', { lang: 'en' }),
  s('city-mexico', 'Mexico City', { lang: 'en' }),
  s('city-sydney', 'Sydney', { lang: 'en' }),
  s('city-toronto', 'Toronto', { lang: 'en' }),
  s('city-cologne', 'Köln', { lang: 'de' }),
  s('city-vienna', 'Wien', { lang: 'de' }),
  s('city-gran-canaria', 'Maspalomas', { lang: 'en' }),
  s('city-sitges', 'Sitges', { lang: 'en' }),
  // Ambiguous names — lang changes the ranking
  s('amb-zurich-en', 'Zurich', { lang: 'en' }),
  s('amb-zurich-none', 'Zurich'),
  s('amb-derby', 'Derby', { lang: 'en' }),
  s('amb-florence', 'Florence', { lang: 'en' }),
  s('amb-saint-augustine', 'Saint Augustine', { lang: 'en' }),
  s('amb-portland', 'Portland', { lang: 'en' }),
  s('amb-cambridge', 'Cambridge', { lang: 'en' }),
  s('amb-zurich-biased', 'Zurich', { lang: 'en', lat: '38.2', lon: '-97.4' }),
  s('amb-typo-zuirch', 'Zuirch', { lang: 'en' }),
  s('amb-typo-berln', 'Berln', { lang: 'en' }),
  // Non-Latin scripts
  s('nl-tokyo', '東京', {}),
  s('nl-moscow', 'Москва', {}),
  s('nl-athens', 'Αθήνα', {}),
  s('nl-tel-aviv-he', 'תל אביב', {}),
  s('nl-cairo', 'القاهرة', {}),
  s('nl-seoul', '서울', {}),
  s('nl-shinjuku', '新宿二丁目', {}),
  // Venues / POIs
  s('poi-stonewall', 'Stonewall Inn, New York', { lang: 'en' }),
  s('poi-berghain', 'Berghain, Berlin', { lang: 'en' }),
  // Reverse
  r('rev-zurich', 47.3769, 8.5417, 'de'),
  r('rev-berlin', 52.52, 13.405),
  r('rev-sf-castro', 37.7609, -122.435),
  r('rev-tokyo', 35.6895, 139.6917),
  r('rev-buenos-aires', -34.6037, -58.3816),
]
