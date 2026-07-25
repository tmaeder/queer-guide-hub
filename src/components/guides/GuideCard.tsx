import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Clock, Flag } from 'lucide-react';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import type { GuideFormat } from '@/hooks/useGuides';
import type { GuideBoostReason } from '@/hooks/useRecommendedGuides';

/**
 * Card for the unified guides family (guide / list / quest). Successor of
 * EditorialGuideCard — base path is always /guides, the eyebrow is
 * format-aware, and quests show their window state.
 */

export interface GuideCardSummary {
  id: string;
  format: GuideFormat;
  slug: string;
  title: string;
  dek: string | null;
  hero_image_path: string | null;
  category: string | null;
  reading_time_min: number | null;
  pick_count: number;
  starts_at?: string | null;
  ends_at?: string | null;
  boost_reason?: GuideBoostReason | null;
}

function WhyChip({ reason }: { reason: GuideBoostReason }) {
  const { t } = useTranslation();
  const label: Record<GuideBoostReason, string> = {
    home_city: t('guides.boost.homeCity', 'Near you'),
    interest: t('guides.boost.interest', 'Matches your interests'),
    category_affinity: t('guides.boost.categoryAffinity', 'Picks for you'),
    featured: t('guides.boost.featured', 'Editor’s pick'),
    continue_reading: t('guides.boost.continueReading', 'Continue reading'),
    active_quest: t('guides.boost.activeQuest', 'Quest live now'),
  };
  return (
    <span className="inline-flex items-center gap-2 rounded-badge border border-border px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground">
      <span aria-hidden className="size-[6px] rounded-full bg-foreground" />
      {label[reason]}
    </span>
  );
}

function questWindowLabel(
  starts_at: string | null | undefined,
  ends_at: string | null | undefined,
  t: (k: string, f: string) => string,
): string | null {
  if (!starts_at || !ends_at) return null;
  const now = Date.now();
  if (now < new Date(starts_at).getTime()) return t('guides.quest.startsSoon', 'Starts soon');
  if (now > new Date(ends_at).getTime()) return t('guides.quest.ended', 'Ended');
  return t('guides.quest.liveNow', 'Live now');
}

function Eyebrow({ guide }: { guide: GuideCardSummary }) {
  const { t } = useTranslation();
  const formatLabel: Record<GuideFormat, string> = {
    guide: t('guides.format.guide', 'Guide'),
    list: t('guides.format.list', 'List'),
    quest: t('guides.format.quest', 'Quest'),
  };
  const parts: string[] = [formatLabel[guide.format]];
  if (guide.category) parts.push(guide.category.replace(/_/g, ' '));
  if (guide.format === 'quest') {
    const w = questWindowLabel(guide.starts_at, guide.ends_at, t);
    if (w) parts.push(w);
  } else if (guide.reading_time_min) {
    parts.push(t('guides.card.minRead', '{{count}} min read').replace('{{count}}', String(guide.reading_time_min)));
  }
  return (
    <p className="text-xs2 uppercase tracking-[0.15em] text-muted-foreground">
      {parts.join(' · ')}
    </p>
  );
}

interface GuideCardProps {
  guide: GuideCardSummary;
  size?: 'default' | 'hero';
  priority?: boolean;
}

export const GuideCard = memo(function GuideCard({
  guide,
  size = 'default',
  priority = false,
}: GuideCardProps) {
  const { t } = useTranslation();
  const hero = resolveImageUrl({ imageUrl: guide.hero_image_path });
  const isHero = size === 'hero';
  const detailUrl = `/guides/${guide.slug}`;
  const isQuest = guide.format === 'quest';

  return (
    <article
      className={
        isHero
          ? 'col-span-12 grid grid-cols-12 gap-6 rounded-container border border-border overflow-hidden bg-card'
          : 'group flex flex-col rounded-container border border-border overflow-hidden bg-card'
      }
    >
      <LocalizedLink
        to={detailUrl}
        className={
          isHero
            ? 'col-span-12 md:col-span-7 relative block aspect-[16/10] md:aspect-auto bg-muted'
            : 'relative block aspect-[16/9] overflow-hidden bg-muted'
        }
        aria-label={`${t('guides.card.open', 'Open guide:')} ${guide.title}`}
      >
        {hero ? (
          <img
            src={hero}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs2 uppercase tracking-[0.15em]">
            {t('guides.card.placeholder', 'Editorial')}
          </div>
        )}
      </LocalizedLink>

      <div
        className={
          isHero
            ? 'col-span-12 md:col-span-5 flex flex-col gap-4 p-8'
            : 'flex flex-1 flex-col gap-4 p-6'
        }
      >
        <Eyebrow guide={guide} />
        <h3
          className={
            isHero
              ? 'text-headline-lg md:text-display leading-tight'
              : 'text-title md:text-headline leading-tight'
          }
        >
          <LocalizedLink
            to={detailUrl}
            className="no-underline hover:underline underline-offset-4"
          >
            {guide.title}
          </LocalizedLink>
        </h3>
        {guide.dek && (
          <p className="italic text-body-lg text-muted-foreground">{guide.dek}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-2 text-13 text-muted-foreground">
            {isQuest ? <Flag size={14} aria-hidden /> : <Clock size={14} aria-hidden />}
            {isQuest
              ? t('guides.card.communityQuest', 'Community quest')
              : t('guides.card.picks', '{{count}} picks').replace('{{count}}', String(guide.pick_count))}
          </span>
          {guide.boost_reason && <WhyChip reason={guide.boost_reason} />}
        </div>
      </div>
    </article>
  );
});
