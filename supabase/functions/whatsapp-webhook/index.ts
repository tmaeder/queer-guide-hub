import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

// ============================================================
// WhatsApp Business webhook (placeholder)
// ------------------------------------------------------------
// Meta's Graph webhook protocol:
//   GET  → echo `hub.challenge` when `hub.verify_token` matches
//   POST → batched event payload, signed via X-Hub-Signature-256
//
// We validate the signature, extract text/media messages, and
// insert into community_submissions. Media download via Graph
// `/media/{id}` is sketched but disabled until WHATSAPP_GRAPH_TOKEN
// is configured. Numbers are obfuscated before storage.
// ============================================================

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') || ''
const GRAPH_TOKEN = Deno.env.get('WHATSAPP_GRAPH_TOKEN') || ''
const GRAPH_BASE = 'https://graph.facebook.com/v20.0'

async function verifySignature(req: Request, raw: string): Promise<boolean> {
  if (!APP_SECRET) return true
  const sig = req.headers.get('x-hub-signature-256') || ''
  if (!sig.startsWith('sha256=')) return false
  const expected = sig.slice('sha256='.length)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const got = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  if (got.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < got.length; i++) {
    mismatch |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

function obfuscatePhone(phone: string): string {
  if (!phone) return ''
  return phone.length <= 4 ? phone : `***${phone.slice(-4)}`
}

interface WAMessage {
  id: string
  from: string
  type: string
  text?: { body?: string }
  image?: { id?: string; caption?: string; mime_type?: string }
  video?: { id?: string; caption?: string }
  document?: { id?: string; caption?: string }
  audio?: { id?: string }
}

async function resolveMediaUrl(mediaId: string): Promise<string | null> {
  if (!GRAPH_TOKEN || !mediaId) return null
  try {
    const res = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${GRAPH_TOKEN}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.url === 'string' ? data.url : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  if (req.method === 'GET') {
    const u = new URL(req.url)
    const mode = u.searchParams.get('hub.mode')
    const token = u.searchParams.get('hub.verify_token')
    const challenge = u.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return errorResponse('verify failed', 403, req)
  }

  if (req.method !== 'POST') return errorResponse('POST only', 405, req)

  const raw = await req.text()
  const ok = await verifySignature(req, raw)
  if (!ok) return errorResponse('invalid signature', 401, req)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return errorResponse('invalid json', 400, req)
  }

  const supabase = getServiceClient()
  const inserted: string[] = []

  const entries = (body.entry ?? []) as Array<Record<string, unknown>>
  for (const entry of entries) {
    const changes = (entry.changes ?? []) as Array<Record<string, unknown>>
    for (const change of changes) {
      const value = (change.value ?? {}) as Record<string, unknown>
      const messages = (value.messages ?? []) as WAMessage[]
      for (const msg of messages) {
        const text =
          msg.text?.body ??
          msg.image?.caption ??
          msg.video?.caption ??
          msg.document?.caption ??
          ''
        const mediaId =
          msg.image?.id ?? msg.video?.id ?? msg.document?.id ?? msg.audio?.id ?? null
        const mediaUrl = mediaId ? await resolveMediaUrl(mediaId) : null
        const mediaUrls = mediaUrl ? [mediaUrl] : []

        const { data: row, error } = await supabase
          .from('community_submissions')
          .insert({
            platform: 'whatsapp',
            sub_source_type: 'webhook',
            status: 'pending',
            media_processing_status: mediaUrls.length ? 'pending' : 'not_applicable',
            content_type: 'tag',
            data: { source: 'whatsapp', wa_message_id: msg.id },
            raw_text: text,
            media_urls: mediaUrls.length ? mediaUrls : null,
            permission_level: 'community_only',
            sensitivity_level: 'semi_public',
            submitter_metadata: {
              from: obfuscatePhone(msg.from),
              type: msg.type,
              wa_message_id: msg.id,
              has_unresolved_media: Boolean(mediaId) && !mediaUrl,
            },
          })
          .select('id')
          .single()

        if (!error && row?.id) inserted.push(row.id)
      }
    }
  }

  return jsonResponse({ success: true, count: inserted.length }, 200, req)
})
