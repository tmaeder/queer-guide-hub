import type { AiProvider } from './types'
import { claudeProvider } from './providers/claude'
import { openaiProvider } from './providers/openai'

// Order = display order. Claude first ("erstmal nur dich"), ChatGPT prepared.
// Add a new backend by dropping an adapter file here — the UI needs no change.
export const PROVIDERS: AiProvider[] = [claudeProvider, openaiProvider]

export const DEFAULT_PROVIDER_ID = claudeProvider.id

export function getProvider(id: string): AiProvider {
  return PROVIDERS.find((p) => p.id === id) ?? claudeProvider
}
