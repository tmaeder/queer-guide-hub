export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
  STATUS_TOKEN: string
  MEDIA_BUCKET: R2Bucket
}

// Subset of Telegram Update we care about. Full schema:
// https://core.telegram.org/bots/api#update
export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  channel_post?: TelegramMessage
}

export interface TelegramMessage {
  message_id: number
  from?: { id: number; username?: string; first_name?: string; is_bot?: boolean }
  chat: { id: number; type: string; title?: string; username?: string }
  date: number
  text?: string
  caption?: string
  photo?: TelegramPhotoSize[]
  video?: TelegramVideo
  document?: TelegramDocument
  forward_from?: { id: number; username?: string; first_name?: string }
  forward_from_chat?: { id: number; type: string; title?: string; username?: string }
  forward_origin?: Record<string, unknown>
  media_group_id?: string
  entities?: TelegramMessageEntity[]
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramVideo {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  duration: number
  thumbnail?: TelegramPhotoSize
  mime_type?: string
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_unique_id: string
  thumbnail?: TelegramPhotoSize
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramMessageEntity {
  type: string
  offset: number
  length: number
  url?: string
}
