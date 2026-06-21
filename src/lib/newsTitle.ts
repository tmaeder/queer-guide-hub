/**
 * Resolve a news article's display title for the active UI locale.
 *
 * `news_articles.title_i18n` is a JSONB map of translated titles keyed by ISO
 * 639-1 code (populated by the `translate-i18n-batch` pipeline). Mirrors the
 * server-side fallback chain in the `news_article_localized_title()` RPC:
 *   requested locale → English translation → original `title`.
 */
export interface LocalizableNewsArticle {
  title?: string | null;
  title_i18n?: Record<string, string> | null;
}

export function localizedNewsTitle(
  article: LocalizableNewsArticle | null | undefined,
  locale: string | null | undefined,
): string {
  if (!article) return '';
  const i18n = article.title_i18n;
  const original = article.title ?? '';
  if (!i18n || typeof i18n !== 'object') return original;

  const lang = (locale || 'en').toLowerCase().split(/[-_]/)[0];
  const candidate = i18n[lang];
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;

  const english = i18n.en;
  if (typeof english === 'string' && english.trim() !== '') return english;

  return original;
}
