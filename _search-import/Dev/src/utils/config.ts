import 'dotenv/config'

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return val
}

function boolEnv(key: string, defaultVal: boolean): boolean {
  const val = process.env[key]
  if (val === undefined) return defaultVal
  return val.toLowerCase() !== 'false' && val !== '0'
}

export const config = {
  databaseUrl: process.env['DATABASE_URL'] ?? '',
  scraperUserAgent:
    process.env['SCRAPER_USER_AGENT'] ??
    'QueerGuideBot/1.0 (contact: ops@yourdomain.tld)',
  politeMode: boolEnv('POLITE_MODE', true),
  maxConcurrency: parseInt(process.env['MAX_CONCURRENCY'] ?? '2', 10),
  snapshotRetention: parseInt(process.env['SNAPSHOT_RETENTION'] ?? '3', 10),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  /** Kill switches: set DISABLE_SOURCE_<NAME>=true to completely skip a source */
  disableSources: {
    wikipedia: boolEnv('DISABLE_SOURCE_WIKIPEDIA', false),
    iglta: boolEnv('DISABLE_SOURCE_IGLTA', false),
    outsavvy: boolEnv('DISABLE_SOURCE_OUTSAVVY', false),
    travelgay: boolEnv('DISABLE_SOURCE_TRAVELGAY', false),
    patroc: boolEnv('DISABLE_SOURCE_PATROC', false),
    misterbandb: boolEnv('DISABLE_SOURCE_MISTERBANDB', false),
  },

  /** Base delays in ms. Polite mode uses the higher value. */
  delays: {
    minMs: 1_000,
    politeModeMinMs: 3_000,
    maxMs: 12_000,
  },
} as const

export type SourceName = keyof typeof config.disableSources
export const ALL_SOURCES: SourceName[] = [
  'wikipedia',
  'iglta',
  'outsavvy',
  'travelgay',
  'patroc',
  'misterbandb',
]
