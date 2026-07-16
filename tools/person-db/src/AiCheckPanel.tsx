import { useRef, useState } from 'react'
import { PROVIDERS, getProvider } from './lib/ai/registry'
import {
  getKey,
  getModel,
  getProviderId,
  setKey,
  setModel,
  setProviderId,
} from './lib/ai/settings'
import type { AiCheckResult } from './lib/ai/types'

// Real, provider-pluggable AI check. Runs the current draft through Claude
// (default) or ChatGPT using the operator's own key (localStorage). The key
// input + call happen entirely in this browser; nothing is sent to queer.guide.

export function AiCheckPanel({
  person,
  onClose,
}: {
  person: Record<string, unknown>
  onClose: () => void
}) {
  const [providerId, setPid] = useState(getProviderId())
  const [keyDraft, setKeyDraft] = useState(getKey(providerId))
  const [modelDraft, setModelDraft] = useState(getModel(providerId))
  const [showSettings, setShowSettings] = useState(!getKey(providerId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AiCheckResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const provider = getProvider(providerId)

  const switchProvider = (id: string) => {
    setPid(id)
    setProviderId(id)
    setKeyDraft(getKey(id))
    setModelDraft(getModel(id))
    setShowSettings(!getKey(id))
    setResult(null)
    setError('')
  }

  const run = async () => {
    const apiKey = keyDraft.trim()
    if (!apiKey) {
      setError(`Kein API-Key für ${provider.label} hinterlegt.`)
      setShowSettings(true)
      return
    }
    setKey(providerId, apiKey)
    setModel(providerId, modelDraft)
    setError('')
    setResult(null)
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const r = await provider.check(person, {
        apiKey,
        model: modelDraft.trim() || undefined,
        signal: ctrl.signal,
      })
      setResult(r)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || String(e))
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const cancel = () => abortRef.current?.abort()

  return (
    <div className="ai-result">
      <div className="ai-result-head">
        <strong>KI-Prüfung</strong>
        <select
          className="ai-provider"
          value={providerId}
          onChange={(e) => switchProvider(e.target.value)}
          disabled={busy}
          title="KI-Anbieter"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <span className="hint">
          Key bleibt lokal · Person wird an {provider.label} gesendet
        </span>
        <button
          className="ai-gear"
          title="Key & Modell"
          onClick={() => setShowSettings((v) => !v)}
        >
          ⚙
        </button>
        <button className="ai-x" onClick={onClose}>×</button>
      </div>

      {showSettings && (
        <div className="ai-settings">
          <label className="ai-field">
            <span>API-Key</span>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={provider.keyPlaceholder}
              autoComplete="off"
            />
          </label>
          <label className="ai-field">
            <span>Modell (optional)</span>
            <input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder={provider.defaultModel}
            />
          </label>
          <p className="hint">{provider.keyHint}</p>
        </div>
      )}

      <div className="ai-run-row">
        {busy ? (
          <button className="check-btn" onClick={cancel}>Abbrechen…</button>
        ) : (
          <button className="check-btn primary" onClick={run}>
            Mit {provider.label} prüfen
          </button>
        )}
        {busy && <span className="hint">läuft…</span>}
      </div>

      {error && <p className="ai-err">Fehler: {error}</p>}

      {result && (
        <div className="ai-out">
          {result.summary && <p className="ai-summary">{result.summary}</p>}
          {result.findings.length === 0 ? (
            <p className="ai-ok">✓ Keine Auffälligkeiten ({result.model}).</p>
          ) : (
            <ul className="ai-list">
              {result.findings.map((f, i) => (
                <li key={i} className={`ai-sev ai-sev-${f.severity}`}>
                  <span className="ai-badge">{f.severity}</span>
                  {f.field && <code className="ai-fld">{f.field}</code>}{' '}
                  {f.message}
                </li>
              ))}
            </ul>
          )}
          <p className="hint">geprüft von {result.model}</p>
        </div>
      )}
    </div>
  )
}
