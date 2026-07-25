import { useTranslation } from 'react-i18next';
import { Flag, ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useActiveQuestGuide } from '@/hooks/useGuides';

/**
 * Banner surfacing the currently running quest on the /guides hub —
 * the shipped incarnation of the formerly orphaned active_quest() concept.
 * Renders nothing when no quest is in its window.
 */
export function ActiveQuestBanner() {
  const { t } = useTranslation();
  const { data: quest } = useActiveQuestGuide();
  if (!quest) return null;

  return (
    <LocalizedLink
      to={`/guides/${quest.slug}`}
      className="group mb-8 flex items-center justify-between gap-4 rounded-container border border-border bg-card p-6 no-underline hover:bg-muted/40"
    >
      <div className="flex items-center gap-4 min-w-0">
        <Flag size={20} aria-hidden className="shrink-0" />
        <div className="min-w-0">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            {t('guides.quest.activeBanner', 'Community quest · live now')}
          </p>
          <p className="truncate text-title group-hover:underline underline-offset-4">
            {quest.title}
          </p>
        </div>
      </div>
      <ArrowRight size={18} aria-hidden className="shrink-0" />
    </LocalizedLink>
  );
}
