import type { Message } from '@/hooks/useMessaging';

export interface ChatImageAttachment {
  url: string;
  width?: number;
  height?: number;
}

/** Extract the first image attachment from a message, if any. */
export function imageAttachment(message: Message): ChatImageAttachment | null {
  const first = message.attachments?.[0];
  if (first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string') {
    const a = first as { url: string; width?: unknown; height?: unknown };
    return {
      url: a.url,
      width: typeof a.width === 'number' ? a.width : undefined,
      height: typeof a.height === 'number' ? a.height : undefined,
    };
  }
  return null;
}
