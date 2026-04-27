import type { Env, TelegramMessage } from './types.ts'
import type { MirroredMedia } from './media.ts'

interface InsertResult {
  id: string
}

export async function insertCommunitySubmission(
  env: Env,
  msg: TelegramMessage,
  media: MirroredMedia[],
): Promise<InsertResult> {
  const text = msg.text ?? msg.caption ?? ''

  const body = {
    platform: 'telegram',
    sub_source_type: 'forwarded',
    status: 'pending',
    content_type: null,
    media_processing_status: media.length ? 'pending' : 'not_applicable',
    permission_level: 'community_only',
    sensitivity_level: 'community',
    raw_text: text,
    media_urls: media.length ? media.map((m) => m.origin_url) : null,
    media_storage_paths: media.length ? media.map((m) => m.storage_path) : null,
    submitter_metadata: {
      telegram: {
        chat_id: msg.chat.id,
        chat_type: msg.chat.type,
        chat_title: msg.chat.title ?? null,
        chat_username: msg.chat.username ?? null,
        from_id: msg.from?.id ?? null,
        from_username: msg.from?.username ?? null,
        from_name: msg.from?.first_name ?? null,
        message_id: msg.message_id,
        date: msg.date,
        forward_origin: msg.forward_origin ?? null,
        forward_from_chat: msg.forward_from_chat ?? null,
        media_group_id: msg.media_group_id ?? null,
      },
    },
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/community_submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw new Error(`supabase insert ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const rows = await res.json() as InsertResult[]
  if (!rows.length) throw new Error('supabase insert returned no rows')
  return rows[0]
}
