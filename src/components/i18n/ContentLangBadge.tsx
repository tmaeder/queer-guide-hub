import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { detectLanguage } from '@/i18n/detectLanguage';

interface Props {
  text?: string | null;
}

function displayName(code: string, uiLanguage: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames;
    if (DN) {
      const out = new DN([uiLanguage], { type: 'language' }).of(code);
      if (out) return out;
    }
  } catch {
    /* fall through */
  }
  return code.toUpperCase();
}

/**
 * Marks content whose detected source language differs from the active UI
 * locale, so users see at a glance which cards are foreign-language.
 * Renders nothing when detection fails or matches the UI locale.
 */
export function ContentLangBadge({ text }: Props) {
  const { t, i18n } = useTranslation();
  if (!text) return null;
  const detected = detectLanguage(text);
  if (!detected) return null;
  const uiLang = (i18n.language || 'en').toLowerCase().split(/[-_]/)[0];
  if (detected === uiLang) return null;
  const lang = displayName(detected, i18n.language || 'en');
  const label = t('common.contentInLanguage', {
    lang,
    defaultValue: `In ${lang}`,
  });
  return (
    <Badge variant="outline" style={{ fontWeight: 400, fontSize: '0.7rem', marginLeft: 6 }}>
      {label}
    </Badge>
  );
}
