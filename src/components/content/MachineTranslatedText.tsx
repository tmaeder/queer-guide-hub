import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  contentLocaleKey,
  hasTranslation,
  localizedField,
  type I18nMap,
} from '@/lib/localizeContent';
import { useRequestTranslation, type TranslatableEntity } from '@/hooks/useRequestTranslation';

/**
 * Renders a translatable field for the active locale.
 *
 * - Translation present → shows it, with "Machine-translated · Show original".
 * - No translation yet  → shows the original and asks the NAS queue for one
 *   (see useRequestTranslation). Never blocks rendering.
 *
 * Everything in a `*_i18n` map is machine output (the NAS worker, or the
 * retired LLM pipeline whose output was kept), so the label is unconditional.
 *
 * `children` receives the text to show, so callers keep their own wrappers
 * (GlossaryLinkedText, <Editable>, …).
 */
export function MachineTranslatedText({
  entityType,
  entityId,
  original,
  i18n,
  children,
}: {
  entityType: TranslatableEntity;
  entityId: string | null | undefined;
  original: string | null | undefined;
  i18n: I18nMap;
  children: (text: string) => ReactNode;
}) {
  const { t, i18n: i18next } = useTranslation();
  const locale = contentLocaleKey(i18next.language);
  const translated = locale !== 'en' && hasTranslation(i18n, locale);
  const [showOriginal, setShowOriginal] = useState(false);

  useRequestTranslation(
    entityType,
    entityId,
    locale,
    locale !== 'en' && !translated && Boolean(original?.trim()),
  );

  if (!translated) return <>{children(original ?? '')}</>;
  const text = showOriginal ? (original ?? '') : localizedField(original, i18n, locale);
  return (
    <>
      <div lang={showOriginal ? undefined : locale}>{children(text)}</div>
      <p className="mt-2 text-13 text-muted-foreground">
        {t('common.machineTranslated', 'Machine-translated')}
        {' · '}
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="rounded-badge underline underline-offset-2 hover:text-foreground"
          aria-pressed={showOriginal}
        >
          {showOriginal
            ? t('common.showTranslation', 'Show translation')
            : t('common.showOriginal', 'Show original')}
        </button>
      </p>
    </>
  );
}
