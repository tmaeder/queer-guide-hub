import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

interface TagSafetyCalloutProps {
  isSensitive?: boolean;
  sensitiveTopics?: string[] | null;
}

export function TagSafetyCallout({ isSensitive, sensitiveTopics }: TagSafetyCalloutProps) {
  const { t } = useTranslation();

  if (!isSensitive && (!sensitiveTopics || sensitiveTopics.length === 0)) return null;

  return (
    <div
      className="flex gap-4 items-start rounded-element bg-muted p-4 mb-6"
      style={{ maxWidth: 680 }}
      role="note"
      aria-label={t('resources.tagDetail.sensitiveContent', 'Content note')}
    >
      <AlertTriangle size={18} className="text-muted-foreground shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-medium mb-1">
          {t('resources.tagDetail.sensitiveContentTitle', 'Content note')}
        </p>
        <p className="text-muted-foreground">
          {t(
            'resources.tagDetail.sensitiveContentBody',
            'This topic may include sensitive content. If you need support, visit our help resources.',
          )}
        </p>
        {sensitiveTopics && sensitiveTopics.length > 0 && (
          <p className="text-muted-foreground mt-1 text-xs">
            {sensitiveTopics.join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
