import { detectPersonalityLanguage } from '@/lib/personalityLanguage';

export interface PersonalityEditorial {
  personality_id: string;
  connection: string | null;
  details: string | null;
  sources: { url: string }[];
  translations: Record<string, string>;
}

export const CONNECTION_LABELS: Record<string, string> = {
  community_member: 'LGBTIQ community member',
  activist: 'LGBTIQ rights activist',
  ally: 'LGBTIQ ally',
  representation: 'LGBTIQ cultural representation',
};

export function baseLanguage(language: string) {
  return language.toLowerCase().split(/[-_]/)[0];
}

export function safeSourceUrl(value: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Only the server's verified projection may supply public connection claims. */
export function publicConnection(editorial?: PersonalityEditorial) {
  if (!editorial) return undefined;
  const sources = editorial.sources.filter((s) => safeSourceUrl(s.url));
  if (!sources.length) return undefined;
  const category =
    editorial.connection && Object.hasOwn(CONNECTION_LABELS, editorial.connection)
      ? editorial.connection
      : undefined;
  const details = editorial.details?.trim() || undefined;
  if (!category && !details) return undefined;
  return { category, details, sources: [...new Set(sources.map((s) => s.url))] };
}

export function localizedPersonalityField(
  original: string | null | undefined,
  field: string,
  language: string,
  editorial?: PersonalityEditorial,
  _descriptionI18n?: unknown,
): { text: string | undefined; language: string | undefined } {
  const locale = baseLanguage(language);
  const translated = editorial?.translations[field];
  // Raw inline maps have no publication or source-review metadata. Only the
  // server projection can provide an approved personality translation.
  const text = translated?.trim() || undefined;
  if (text) return { text, language: locale };
  const fallback = original?.trim() || undefined;
  // English is the canonical base language. Legacy non-English prose can be
  // detected; short English summaries such as "German singer" have no stopwords.
  return {
    text: fallback,
    language: fallback ? (detectPersonalityLanguage(fallback) ?? 'en') : undefined,
  };
}
