import { ContentLangBadge } from '@/components/i18n/ContentLangBadge';
import { localizedPersonalityField, type PersonalityEditorial } from '@/lib/personalityEditorial';
import { useTranslation } from 'react-i18next';

export function PersonalityText({
  value,
  field,
  editorial,
  descriptionI18n,
  className,
}: {
  value?: string | null;
  field: string;
  editorial?: PersonalityEditorial;
  descriptionI18n?: unknown;
  className?: string;
}) {
  const { i18n } = useTranslation();
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
  return (
    <div className={className}>
      <ContentLangBadge text={content.text} language={content.language} />
      <p lang={content.language} dir="auto" className="whitespace-pre-line">
        {content.text}
      </p>
    </div>
  );
}
