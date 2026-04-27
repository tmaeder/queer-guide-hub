import type { Env } from './types.ts'

const TG_API = (token: string) => `https://api.telegram.org/bot${token}`
const TG_FILE = (token: string) => `https://api.telegram.org/file/bot${token}`

interface TelegramFileMeta {
  file_id: string
  file_unique_id: string
  file_size?: number
  file_path?: string
}

export async function getFileMeta(env: Env, fileId: string): Promise<TelegramFileMeta> {
  const res = await fetch(`${TG_API(env.TELEGRAM_BOT_TOKEN)}/getFile?file_id=${encodeURIComponent(fileId)}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`getFile ${res.status}`)
  const json = await res.json() as { ok: boolean; result?: TelegramFileMeta; description?: string }
  if (!json.ok || !json.result) throw new Error(`getFile: ${json.description ?? 'unknown'}`)
  return json.result
}

export async function downloadFile(env: Env, filePath: string): Promise<{ body: ArrayBuffer; contentType: string }> {
  const url = `${TG_FILE(env.TELEGRAM_BOT_TOKEN)}/${filePath}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`download ${res.status}`)
  const contentType = res.headers.get('Content-Type') || guessMime(filePath)
  return { body: await res.arrayBuffer(), contentType }
}

export async function sendMessage(env: Env, chatId: number, text: string): Promise<void> {
  await fetch(`${TG_API(env.TELEGRAM_BOT_TOKEN)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => { /* best-effort reply, never fail the webhook */ })
}

function guessMime(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  } as Record<string, string>)[ext] ?? 'application/octet-stream'
}
