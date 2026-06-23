import { toast } from '@/hooks/use-toast';

export interface ShareOptions {
  title?: string;
  text?: string;
  url: string;
}

export async function shareOrCopy(opts: ShareOptions): Promise<void> {
  const { title, text, url } = opts;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: url });
  } catch {
    toast({ title: 'Could not copy link', description: url, variant: 'destructive' });
  }
}

// Explicit share-to-social targets (outbound growth). No tracking pixels — each
// is a plain intent URL opened in a new tab. Icons are resolved by the consumer
// via the social registry; this stays data-only.
export type ShareTarget = 'x' | 'facebook' | 'whatsapp' | 'telegram' | 'bluesky' | 'reddit';

export const SHARE_TARGETS: { target: ShareTarget; label: string; platformKey: string }[] = [
  { target: 'x', label: 'X', platformKey: 'twitter' },
  { target: 'bluesky', label: 'Bluesky', platformKey: 'bluesky' },
  { target: 'facebook', label: 'Facebook', platformKey: 'facebook' },
  { target: 'whatsapp', label: 'WhatsApp', platformKey: 'website' },
  { target: 'telegram', label: 'Telegram', platformKey: 'telegram' },
  { target: 'reddit', label: 'Reddit', platformKey: 'reddit' },
];

export function buildShareUrl(target: ShareTarget, opts: ShareOptions): string {
  const url = encodeURIComponent(opts.url);
  const title = [opts.title, opts.text].filter(Boolean).join(' — ');
  const text = encodeURIComponent(title);
  switch (target) {
    case 'x':
      return `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
    case 'bluesky':
      return `https://bsky.app/intent/compose?text=${text}%20${url}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    case 'whatsapp':
      return `https://wa.me/?text=${text}%20${url}`;
    case 'telegram':
      return `https://t.me/share/url?url=${url}&text=${text}`;
    case 'reddit':
      return `https://www.reddit.com/submit?url=${url}&title=${text}`;
  }
}

export function articleShareUrl(slug: string): string {
  if (typeof window === 'undefined') return `https://queer.guide/news/${slug}`;
  return `${window.location.origin}/news/${slug}`;
}

const WORDS_PER_MINUTE = 220;

export function estimateReadingTime(content?: string | null, excerpt?: string | null): number | null {
  const src = content || excerpt;
  if (!src) return null;
  const text = src.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 30) return null;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
