import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { detectLanguage } from '@/i18n/detectLanguage';
import { languageDisplayName as displayName } from '@/lib/languageDisplayName';

interface Props {
  text?: string | null;
  /**
   * Authoritative ISO 639-1 source language (e.g. from
   * `events.content_language`). When provided, skips the heuristic detector.
   */
  language?: string | null;
}

/**
 * Marks content whose detected source language differs from the active UI
 * locale, so users see at a glance which cards are foreign-language.
 * Renders nothing when detection fails or matches the UI locale.
 */
export function ContentLangBadge({ text, language }: Props) {
  const { t, i18n } = useTranslation();
  const authoritative = language?.toLowerCase().split(/[-_]/)[0] || null;
  if (!authoritative && !text) return null;
  const detected = authoritative ?? (text ? detectLanguage(text) : null);
  if (!detected) return null;
  const uiLang = (i18n.language || 'en').toLowerCase().split(/[-_]/)[0];
  if (detected === uiLang) return null;
  const lang = displayName(detected, i18n.language || 'en');
  const label = t('common.contentInLanguage', {
    lang,
    defaultValue: `In ${lang}`,
  });
  return (
    <Badge variant="outline" className="text-xs2 font-normal ml-1.5">
      {label}
    </Badge>
  );
}
