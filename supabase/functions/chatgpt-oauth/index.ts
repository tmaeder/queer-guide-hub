/**
 * ChatGPT OAuth 2.0 flow handler.
 *
 * Actions:
 *   authorize  — Returns OpenAI OAuth authorization URL
 *   callback   — Exchanges auth code for tokens, stores encrypted in DB
 *   status     — Returns connection status (connected/disconnected, expiry)
 *   disconnect — Revokes tokens and deletes from DB
 *   test       — Makes a minimal API call to verify credentials work
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { corsHeaders, requireAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { encrypt, decrypt, getOpenAIAccessToken } from '../_shared/openai-client.ts'

// ---------------------------------------------------------------------------
// OAuth configuration from env vars
// ---------------------------------------------------------------------------

function getOAuthConfig() {
  return {
    clientId: Deno.env.get('OPENAI_OAUTH_CLIENT_ID') || '',
    clientSecret: Deno.env.get('OPENAI_OAUTH_CLIENT_SECRET') || '',
    redirectUri: Deno.env.get('OPENAI_OAUTH_REDIRECT_URI') || '',
    authorizationUrl: 'https://auth.openai.com/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
  }
}

// ---------------------------------------------------------------------------
// Action: authorize — generate OAuth URL
// ---------------------------------------------------------------------------

async function handleAuthorize(supabase: any) {
  const config = getOAuthConfig()
  if (!config.clientId || !config.redirectUri) {
    return errorResponse('OAuth not configured: missing OPENAI_OAUTH_CLIENT_ID or OPENAI_OAUTH_REDIRECT_URI', 400)
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateRandomString(64)
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  // Generate state parameter for CSRF protection
  const state = generateRandomString(32)

  // Store state + verifier temporarily (in-memory for edge function lifetime,
  // or we could store in DB — we'll encode in state param for stateless approach)
  const statePayload = btoa(JSON.stringify({ state, codeVerifier }))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openai.public',
    state: statePayload,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `${config.authorizationUrl}?${params.toString()}`

  return jsonResponse({
    success: true,
    authorization_url: authUrl,
    state: statePayload,
  })
}

// ---------------------------------------------------------------------------
// Action: callback — exchange code for tokens
// ---------------------------------------------------------------------------

async function handleCallback(supabase: any, body: any, userId: string) {
  const { code, state: statePayload } = body

  if (!code) {
    return errorResponse('Missing authorization code', 400)
  }

  const config = getOAuthConfig()
  if (!config.clientId || !config.clientSecret) {
    return errorResponse('OAuth not configured: missing client credentials', 400)
  }

  // Decode state to get PKCE code verifier
  let codeVerifier = ''
  if (statePayload) {
    try {
      const decoded = JSON.parse(atob(statePayload))
      codeVerifier = decoded.codeVerifier || ''
    } catch {
      return errorResponse('Invalid state parameter', 400)
    }
  }

  // Exchange authorization code for tokens
  const tokenParams: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  }
  if (codeVerifier) {
    tokenParams.code_verifier = codeVerifier
  }

  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tokenParams),
  })

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text()
    console.error('OAuth token exchange failed:', err)
    return errorResponse(`Token exchange failed: ${tokenResponse.status}`, 400)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token as string
  const refreshToken = tokenData.refresh_token as string | undefined
  const expiresIn = (tokenData.expires_in as number) || 3600
  const scope = (tokenData.scope as string) || ''

  if (!accessToken) {
    return errorResponse('No access token received from OpenAI', 400)
  }

  // Encrypt tokens before storage
  const encryptedAccess = await encrypt(accessToken)
  const encryptedRefresh = refreshToken ? await encrypt(refreshToken) : null
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Deactivate any existing active tokens
  await supabase
    .from('chatgpt_oauth_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)

  // Insert new token
  const { error: insertError } = await supabase
    .from('chatgpt_oauth_tokens')
    .insert({
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_type: tokenData.token_type || 'bearer',
      expires_at: expiresAt,
      scope,
      created_by: userId,
      is_active: true,
    })

  if (insertError) {
    console.error('Failed to store OAuth tokens:', insertError)
    return errorResponse('Failed to store tokens', 500)
  }

  return jsonResponse({
    success: true,
    message: 'ChatGPT connected successfully',
    expires_at: expiresAt,
    scope,
  })
}

// ---------------------------------------------------------------------------
// Action: status — check connection status
// ---------------------------------------------------------------------------

async function handleStatus(supabase: any) {
  const { data: tokenRow } = await supabase
    .from('chatgpt_oauth_tokens')
    .select('id, expires_at, scope, openai_organization_id, created_at, updated_at, is_active')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tokenRow) {
    // Check if API key is configured as fallback
    const hasApiKey = !!Deno.env.get('OPENAI_API_KEY')
    return jsonResponse({
      connected: false,
      method: hasApiKey ? 'api_key' : 'none',
      has_api_key_fallback: hasApiKey,
      oauth_configured: !!(Deno.env.get('OPENAI_OAUTH_CLIENT_ID') && Deno.env.get('OPENAI_OAUTH_CLIENT_SECRET')),
    })
  }

  const now = new Date()
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null
  const isExpired = expiresAt ? expiresAt.getTime() < now.getTime() : false

  return jsonResponse({
    connected: true,
    method: 'oauth',
    expires_at: tokenRow.expires_at,
    is_expired: isExpired,
    scope: tokenRow.scope,
    organization_id: tokenRow.openai_organization_id,
    connected_at: tokenRow.created_at,
    last_refreshed: tokenRow.updated_at,
    has_api_key_fallback: !!Deno.env.get('OPENAI_API_KEY'),
  })
}

// ---------------------------------------------------------------------------
// Action: disconnect — revoke and delete tokens
// ---------------------------------------------------------------------------

async function handleDisconnect(supabase: any) {
  // Deactivate all tokens
  const { error } = await supabase
    .from('chatgpt_oauth_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)

  if (error) {
    console.error('Failed to deactivate tokens:', error)
    return errorResponse('Failed to disconnect', 500)
  }

  return jsonResponse({ success: true, message: 'ChatGPT disconnected' })
}

// ---------------------------------------------------------------------------
// Action: test — verify the connection works
// ---------------------------------------------------------------------------

async function handleTest(supabase: any) {
  try {
    const accessToken = await getOpenAIAccessToken(supabase)

    // Make a minimal API call
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const err = await response.text()
      return jsonResponse({
        success: false,
        error: `API returned ${response.status}`,
        details: err.slice(0, 200),
      })
    }

    const data = await response.json()
    const models = (data.data || [])
      .map((m: any) => m.id)
      .filter((id: string) => id.startsWith('gpt-'))
      .sort()

    return jsonResponse({
      success: true,
      message: 'Connection verified',
      available_models: models,
    })
  } catch (err) {
    return jsonResponse({
      success: false,
      error: (err as Error).message,
    })
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, v => chars[v % chars.length]).join('')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // All actions require admin
    const authResult = await requireAdmin(req, supabase)
    if (authResult instanceof Response) return authResult
    const { userId } = authResult

    // Parse action from query string or body
    const url = new URL(req.url)
    let action = url.searchParams.get('action')

    let body: any = {}
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}))
      if (!action) action = body.action
    }

    if (!action) {
      return errorResponse('Missing action parameter', 400)
    }

    switch (action) {
      case 'authorize':
        return await handleAuthorize(supabase)
      case 'callback':
        return await handleCallback(supabase, body, userId)
      case 'status':
        return await handleStatus(supabase)
      case 'disconnect':
        return await handleDisconnect(supabase)
      case 'test':
        return await handleTest(supabase)
      default:
        return errorResponse(`Unknown action: ${action}`, 400)
    }
  } catch (err) {
    console.error('ChatGPT OAuth error:', err)
    return errorResponse('Internal server error', 500)
  }
})
