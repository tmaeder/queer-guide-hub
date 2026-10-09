import { useEffect, useMemo } from 'react';
import { Camera, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ReportContextPanelProps {
  id: string;
  screenshotBlob?: Blob | null;
  includeScreenshot: boolean;
  onIncludeScreenshotChange: (include: boolean) => void;
}

export function ReportContextPanel({
  id,
  screenshotBlob,
  includeScreenshot,
  onIncludeScreenshotChange,
}: ReportContextPanelProps) {
  const { t } = useTranslation();
  const screenshotUrl = useMemo(
    () => (screenshotBlob ? URL.createObjectURL(screenshotBlob) : null),
    [screenshotBlob],
  );

  useEffect(
    () => () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    },
    [screenshotUrl],
  );

  return (
    <div className="mb-6 space-y-4">
      {screenshotBlob && (
        <div className="rounded-container bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={includeScreenshot}
              onCheckedChange={(checked) => onIncludeScreenshotChange(checked === true)}
            />
            <Label htmlFor={id} className="flex cursor-pointer items-center gap-1.5">
              <Camera size={14} aria-hidden="true" />
              {t('contribute.feedback.includeScreenshot', 'Include screenshot of this page')}
            </Label>
          </div>
          {includeScreenshot && screenshotUrl && (
            <img
              src={screenshotUrl}
              alt={t('contribute.feedback.screenshotPreview', 'Screenshot preview')}
              className="ml-8 mt-2 max-w-56 rounded-element bg-muted"
            />
          )}
        </div>
      )}

      <div className="flex items-start gap-4 rounded-container bg-surface-container-high p-4 text-xs leading-relaxed text-muted-foreground">
        <Info size={16} className="mt-0.5 shrink-0 text-foreground" aria-hidden="true" />
        <span>
          {t(
            'contribute.feedback.contextNote',
            'Automatically included: current page URL, browser information, recent errors and network failures.',
          )}
        </span>
      </div>
    </div>
  );
}
