import type { Env } from './types.ts'
import { getFileMeta, downloadFile } from './telegram.ts'

export interface MirroredMedia {
  origin_url: string
  storage_path: string
  content_type: string
  size: number
}

const MAX_BYTES = 50 * 1024 * 1024 // 50MB hard cap; Telegram free tier maxes lower

export async function mirrorTelegramFile(
  env: Env,
  fileId: string,
  prefix: string,
): Promise<MirroredMedia | null> {
  try {
    const meta = await getFileMeta(env, fileId)
    if (!meta.file_path) return null
    if (typeof meta.file_size === 'number' && meta.file_size > MAX_BYTES) return null

    const { body, contentType } = await downloadFile(env, meta.file_path)
    if (body.byteLength > MAX_BYTES) return null

    const ext = meta.file_path.split('.').pop() ?? 'bin'
    const key = `${prefix}/${meta.file_unique_id}.${ext}`
    await env.MEDIA_BUCKET.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: { source: 'telegram', file_id: meta.file_unique_id },
    })

    return {
      origin_url: `tg://file/${meta.file_unique_id}`,
      storage_path: key,
      content_type: contentType,
      size: body.byteLength,
    }
  } catch (err) {
    console.error('mirrorTelegramFile failed:', (err as Error).message)
    return null
  }
}
