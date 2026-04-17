/**
 * Centralised OpenAI client with OAuth token management.
 *
 * Token resolution order:
 *  1. Active OAuth token from `chatgpt_oauth_tokens` (auto-refreshes if expired)
 *  2. Fallback to `OPENAI_API_KEY` env var
 *
 * All edge functions should use `chatCompletion()` instead of direct fetch().
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// ---------------------------------------------------------------------------
// AES-GCM encryption helpers (same pattern as manage-api-keys)
// ---------------------------------------------------------------------------

/**
 * Derive a 256-bit AES key from the master key using HKDF.
 * This avoids the zero-padding weakness when the key is shorter than 32 bytes.
 */
async function deriveKey(usage: KeyUsage[]): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY')
  if (!masterKey) throw new Error('MASTER_ENCRYPTION_KEY not configured')
  if (masterKey.length < 32) {
    throw new Error('MASTER_ENCRYPTION_KEY must be at least 32 characters')
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('queer-guide-hkdf-salt-v1\0\0\0\0\0\0\0\0\0'), info: new TextEncoder().encode('queer-guide-aes') },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  )
}

async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await deriveKey(['decrypt'])

  const combined = new Uint8Array(
    atob(encryptedBase64).split('').map(c => c.charCodeAt(0)),
  )
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

async function encrypt(text: string): Promise<string> {
  const key = await deriveKey(['encrypt'])

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text),
  )

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

// ---------------------------------------------------------------------------
// OAuth token management
// ---------------------------------------------------------------------------

interface OAuthTokenRow {
  id: string
  access_token: string      // encrypted
  refresh_token: string | null // encrypted
  expires_at: string | null
  is_active: boolean
}

/**
 * Refresh an OAuth access token using the refresh token.
 * Stores the new tokens encrypted in the DB.
 */
export async function refreshOAuthToken(
  supabase: SupabaseClient,
  tokenRow: OAuthTokenRow,
): Promise<string> {
  const clientId = Deno.env.get('OPENAI_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('OPENAI_OAUTH_CLIENT_SECRET')

  if (!clientId || !clientSecret || !tokenRow.refresh_token) {
    throw new Error('Cannot refresh: missing OAuth client credentials or refresh token')
  }

  const refreshToken = await decrypt(tokenRow.refresh_token)

  const response = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    // Mark token as inactive on permanent failure
    if (response.status === 400 || response.status === 401) {
      await supabase
        .from('chatgpt_oauth_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', tokenRow.id)
    }
    throw new Error(`OAuth refresh failed (${response.status}): ${err}`)
  }

  const data = await response.json()
  const newAccessToken = data.access_token as string
  const newRefreshToken = (data.refresh_token as string) || refreshToken
  const expiresIn = (data.expires_in as number) || 3600

  // Store new tokens encrypted
  const encryptedAccess = await encrypt(newAccessToken)
  const encryptedRefresh = await encrypt(newRefreshToken)
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  await supabase
    .from('chatgpt_oauth_tokens')
    .update({
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenRow.id)

  return newAccessToken
}

/**
 * Get a valid OpenAI access token.
 *
 * 1. Check for active OAuth token in DB (auto-refresh if expired)
 * 2. Fall back to OPENAI_API_KEY env var
 * 3. Throw if neither is available
 */
export async function getOpenAIAccessToken(supabase: SupabaseClient): Promise<string> {
  // 1. Try OAuth token from DB
  const { data: tokenRow } = await supabase
    .from('chatgpt_oauth_tokens')
    .select('id, access_token, refresh_token, expires_at, is_active')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tokenRow) {
    const now = new Date()
    const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null

    // Token is still valid (with 5-minute buffer)
    if (!expiresAt || expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
      try {
        return await decrypt(tokenRow.access_token)
      } catch (err) {
        console.warn('Failed to decrypt OAuth token, attempting refresh:', err)
      }
    }

    // Token expired or about to expire — try refresh
    if (tokenRow.refresh_token) {
      try {
        return await refreshOAuthToken(supabase, tokenRow as OAuthTokenRow)
      } catch (err) {
        console.warn('OAuth refresh failed, falling back to API key:', err)
      }
    }
  }

  // 2. Fall back to static API key
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (apiKey) return apiKey

  throw new Error(
    'No OpenAI credentials available. Configure OAuth via admin panel or set OPENAI_API_KEY.',
  )
}

// ---------------------------------------------------------------------------
// Chat Completion wrapper
// ---------------------------------------------------------------------------

export interface ChatCompletionOptions {
  model?: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  max_tokens?: number
  response_format?: { type: string }
}

export interface ChatCompletionResult {
  content: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  model: string
}

/**
 * Make a chat completion request to OpenAI.
 * Handles token resolution, rate limiting (429), and retries.
 */
export async function chatCompletion(
  supabase: SupabaseClient,
  options: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const {
    model = 'gpt-4o-mini',
    messages,
    temperature = 0.3,
    max_tokens = 2000,
    response_format,
  } = options

  const accessToken = await getOpenAIAccessToken(supabase)

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
    // Privacy: opt out of OpenAI's 30-day retention; prompts + completions
    // are not persisted. See docs/dependency-audit/migration-plan.md §1.5.
    store: false,
  }
  if (response_format) body.response_format = response_format

  let lastError: Error | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      const data = await response.json()
      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
        model: data.model,
      }
    }

    // Rate limit — wait and retry
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '30', 10)
      const waitMs = Math.min(retryAfter * 1000, 60000)
      console.warn(`OpenAI rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/3)`)
      await new Promise(r => setTimeout(r, waitMs))
      lastError = new Error(`Rate limited (429)`)
      continue
    }

    // Non-retryable error
    const errText = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${errText}`)
  }

  throw lastError || new Error('OpenAI request failed after retries')
}

/**
 * Check if OpenAI is available (OAuth or API key configured).
 * Non-throwing — returns false if no credentials.
 */
export async function isOpenAIAvailable(supabase: SupabaseClient): Promise<boolean> {
  try {
    await getOpenAIAccessToken(supabase)
    return true
  } catch {
    return false
  }
}

// Re-export encryption helpers for use by chatgpt-oauth function
export { encrypt, decrypt }
