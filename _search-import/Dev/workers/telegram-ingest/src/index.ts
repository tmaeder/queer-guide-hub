import type { Env, TelegramUpdate, TelegramMessage } from './types.ts'
import { sendMessage } from './telegram.ts'
import { mirrorTelegramFile, type MirroredMedia } from './media.ts'
import { insertCommunitySubmission } from './insert.ts'

// ============================================================
// Telegram Ingest Worker
// ------------------------------------------------------------
// Webhook receives updates from a Telegram bot. Extracts text +
// media (photos, videos, documents), mirrors media to R2, and
// inserts a row into community_submissions for the social-media
// ingestion pipeline. Replies to the user with the submission id.
// ============================================================

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'telegram-ingest' })
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      return statusEndpoint(req, env)
    }
    if (req.method === 'POST' && url.pathname === '/webhook') {
      return webhook(req, env)
    }
    return new Response('not found', { status: 404 })
  },
}

async function webhook(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = await req.json() as TelegramUpdate
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const msg = update.message ?? update.channel_post
  if (!msg) return json({ ok: true, ignored: 'no message' })

  try {
    const media = await collectMedia(env, msg)
    const inserted = await insertCommunitySubmission(env, msg, media)
    await sendMessage(env, msg.chat.id, `Received #${inserted.id}, queued for review.`)
    return json({ ok: true, submission_id: inserted.id, media_count: media.length })
  } catch (err) {
    console.error('webhook error:', err)
    // Respond 200 anyway so Telegram doesn't endlessly retry into our error bucket.
    // The error has been logged; ops can replay from update_id if needed.
    return json({ ok: false, error: (err as Error).message }, 200)
  }
}

async function collectMedia(env: Env, msg: TelegramMessage): Promise<MirroredMedia[]> {
  const out: MirroredMedia[] = []
  const datePrefix = new Date(msg.date * 1000).toISOString().slice(0, 10)
  const prefix = `telegram/${datePrefix}/${msg.chat.id}`

  if (msg.photo?.length) {
    // Telegram returns multiple sizes — pick the largest.
    const largest = msg.photo.reduce((a, b) => (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b)
    const m = await mirrorTelegramFile(env, largest.file_id, prefix)
    if (m) out.push(m)
  }
  if (msg.video) {
    const m = await mirrorTelegramFile(env, msg.video.file_id, prefix)
    if (m) out.push(m)
    if (msg.video.thumbnail) {
      const t = await mirrorTelegramFile(env, msg.video.thumbnail.file_id, prefix)
      if (t) out.push(t)
    }
  }
  if (msg.document && msg.document.mime_type?.startsWith('image/')) {
    const m = await mirrorTelegramFile(env, msg.document.file_id, prefix)
    if (m) out.push(m)
  }

  return out
}

async function statusEndpoint(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${env.STATUS_TOKEN}`) {
    return new Response('forbidden', { status: 403 })
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/community_submissions?platform=eq.telegram&order=submitted_at.desc&limit=20&select=id,status,submitted_at,raw_text`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )
  if (!res.ok) return json({ ok: false, error: `status ${res.status}` }, 502)
  return json({ ok: true, recent: await res.json() })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
