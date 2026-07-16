import { DEFAULT_PROVIDER_ID } from './registry'

// AI settings live only in this browser (localStorage). API keys never leave
// the machine except in the direct call to the chosen provider. No key is ever
// bundled with the app.
const KEY = 'person-db.ai.v1'

interface AiSettings {
  providerId: string
  keys: Record<string, string> // providerId → API key
  models: Record<string, string> // providerId → model override (optional)
}

function read(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<AiSettings>
      return {
        providerId: s.providerId || DEFAULT_PROVIDER_ID,
        keys: s.keys || {},
        models: s.models || {},
      }
    }
  } catch { /* corrupt / unavailable */ }
  return { providerId: DEFAULT_PROVIDER_ID, keys: {}, models: {} }
}

function write(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* storage full / blocked */ }
}

export function getProviderId(): string {
  return read().providerId
}

export function setProviderId(id: string) {
  const s = read()
  s.providerId = id
  write(s)
}

export function getKey(providerId: string): string {
  return read().keys[providerId] ?? ''
}

export function setKey(providerId: string, key: string) {
  const s = read()
  s.keys[providerId] = key.trim()
  write(s)
}

export function getModel(providerId: string): string {
  return read().models[providerId] ?? ''
}

export function setModel(providerId: string, model: string) {
  const s = read()
  const m = model.trim()
  if (m) s.models[providerId] = m
  else delete s.models[providerId]
  write(s)
}
