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
