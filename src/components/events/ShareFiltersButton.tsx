import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

interface ShareFiltersButtonProps {
  className?: string;
}

export function ShareFiltersButton({ className }: ShareFiltersButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClick}
            aria-label={t('pages.events.shareFilters', 'Copy share link')}
            className={className}
            style={{ display: 'inline-flex', gap: 6 }}
          >
            {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
            <span className="hidden sm:inline">
              {copied
                ? t('pages.events.shareCopied', 'Copied')
                : t('pages.events.share', 'Share')}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t('pages.events.shareFiltersHint', 'Copy a link to these filters')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
