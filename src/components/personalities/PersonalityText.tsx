import { ContentLangBadge } from '@/components/i18n/ContentLangBadge';
import { localizedPersonalityField, type PersonalityEditorial } from '@/lib/personalityEditorial';
import { useTranslation } from 'react-i18next';
import { completeProse } from '@/lib/proseFragment';

export function PersonalityText({
  value,
  field,
  editorial,
  descriptionI18n,
  className,
  completeOnly,
  continueUrl,
}: {
  value?: string | null;
  field: string;
  editorial?: PersonalityEditorial;
  descriptionI18n?: unknown;
  className?: string;
  /** Trim a trailing unfinished sentence and label the rest as an excerpt. */
  completeOnly?: boolean;
  /** Where the excerpt continues (the record's source). */
  continueUrl?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const content = localizedPersonalityField(
    value,
    field,
    i18n.resolvedLanguage || i18n.language || 'en',
    editorial,
    descriptionI18n,
  );
  if (field === 'connection_label')
    content.language = i18n.resolvedLanguage || i18n.language || 'en';
  if (!content.text) return null;
  const prose = completeOnly
    ? completeProse(content.text)
    : { text: content.text, isExcerpt: false };
  if (!prose.text) return null;
  return (
    <div className={className}>
      <ContentLangBadge text={prose.text} language={content.language} />
      <p lang={content.language} dir="auto" className="whitespace-pre-line">
        {prose.text}
      </p>
      {prose.isExcerpt && (
        <p className="mt-2 text-13 text-muted-foreground">
          {t('pages.personalities.ui.excerpt', 'Excerpt.')}{' '}
          {continueUrl && (
            <a href={continueUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {t('pages.personalities.ui.continueAtSource', 'Continue reading at the source')}
            </a>
          )}
        </p>
      )}
    </div>
  );
}
