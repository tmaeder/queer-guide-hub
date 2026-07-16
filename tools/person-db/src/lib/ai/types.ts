// Provider-agnostic AI check contract.
// One person's draft goes in, a list of findings comes out. Every provider
// (Claude first, ChatGPT/others later) implements the same `AiProvider` shape,
// so the UI never learns which backend answered.

export type Severity = 'error' | 'warn' | 'info'

export interface AiFinding {
  severity: Severity
  field?: string // which person field the finding is about, if any
  message: string // German, one sentence
}

export interface AiCheckResult {
  findings: AiFinding[]
  summary?: string // one-line overall verdict
  model: string // which model actually answered
  raw?: string // raw model text, for debugging / "show raw"
}

export interface AiCheckOptions {
  apiKey: string
  model?: string // override the provider default
  signal?: AbortSignal
}

export interface AiProvider {
  id: string // stable key, e.g. 'claude'
  label: string // human name, e.g. 'Claude (Anthropic)'
  defaultModel: string
  keyPlaceholder: string // placeholder for the API-key input
  keyHint: string // where to get a key
  // Direct browser call to the provider. Throws on transport/HTTP/parse error.
  check(person: Record<string, unknown>, opts: AiCheckOptions): Promise<AiCheckResult>
}
