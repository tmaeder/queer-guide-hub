import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown, Clock, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SearchHit } from '@/lib/searchClient';
import { DESTINATIONS, INTENT_NAV, INTENT_TRACK, NAV_CLUSTERS } from '@/config/navigation';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { StationRing } from '@/components/transit/StationRing';
import { ModeSwitcher } from './ModeSwitcher';

export interface SearchPopoverEmptyProps {
  trending: SearchHit[];
  /** Whether `trending` is the personalized recommendations feed or plain trending. */
  source?: 'recommended' | 'trending';
  onSelectTrending: (hit: SearchHit) => void;
  onBrowse: (path: string) => void;
  onAsk: () => void;
  recents?: string[];
  onSelectRecent?: (term: string) => void;
  onClearRecents?: () => void;
}

/** The mock's eyebrow: small, loud, and the one sanctioned wide-tracked type. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-2 pt-4 sm:px-6 text-2xs font-bold uppercase tracking-label text-muted-foreground">
      {children}
    </div>
  );
}

/** Compact navigation links; recent queries receive a quiet bordered surface. */
const CHIP =
  'inline-flex cursor-pointer min-h-10 items-center gap-2 rounded-element bg-transparent px-2 py-2 text-13 font-semibold text-foreground transition-colors hover:bg-surface-container';

export function SearchPopoverEmpty({
  trending,
  source = 'trending',
  onSelectTrending,
  onBrowse,
  onAsk,
  recents = [],
  onSelectRecent,
  onClearRecents,
}: SearchPopoverEmptyProps) {
  const { t } = useTranslation();
  const tiles = trending.slice(0, 6);
  const recentItems = recents.slice(0, 5);
  const heading =
    source === 'recommended' ? t('search.forYou', 'For you') : t('search.trending', 'Trending');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {recentItems.length > 0 && onSelectRecent && (
        <>
          <div className="flex items-center justify-between px-4 pt-4 sm:px-6">
            <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {t('search.recent', 'Recent')}
            </span>
            {onClearRecents && (
              <button
                type="button"
                onClick={onClearRecents}
                aria-label={t('search.clearRecent', 'Clear')}
                className="min-h-8 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t('search.clearRecent', 'Clear')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-1 sm:px-6">
            {recentItems.map((term, i) => (
              <button
                key={`recent-${i}`}
                type="button"
                onClick={() => onSelectRecent(term)}
                className={`${CHIP} max-w-[200px] border border-border-hairline bg-surface-container/50`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{term}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Intents lead. An empty query means the person has not decided what to
          type, and the most useful thing to hand them is the six jobs — not a
          content-type index. This block used to be absent entirely, so the
          site's highest-frequency discovery surface (⌘K on desktop, the whole
          header row on mobile) taught only the model the Intent Router
          replaced. Each chip carries its own line's station ring, so the same
          colour that names the job in the topbar names it here. */}
      <Eyebrow>{t('search.jumpTo', 'Jump to')}</Eyebrow>
      <div className="grid grid-cols-2 gap-x-2 px-4 pb-2 sm:grid-cols-4 sm:px-6">
        {INTENT_NAV.map((intent) => (
          <button
            key={intent.id}
            type="button"
            onClick={() => onBrowse(intent.to)}
            className={CHIP}
            title={t(intent.subtitleKey, intent.subtitleFallback)}
          >
            <StationRing
              state="typed"
              track={INTENT_TRACK[intent.id] ?? 'pink'}
              className="h-3 w-3"
            />
            {t(intent.labelKey, intent.fallback)}
          </button>
        ))}
      </div>

      {tiles.length > 0 && (
        <>
          <Eyebrow>{heading}</Eyebrow>
          <ul className="grid grid-cols-1 gap-x-4 px-4 pb-2 sm:grid-cols-2 sm:px-6">
            {tiles.map((hit) => {
              const name = (hit.title || hit.name || '') as string;
              if (!name) return null;
              const meta = [hit.city, hit.country].filter(Boolean).join(' · ');
              return (
                <li key={`trend-${hit.type}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelectTrending(hit)}
                    className="group flex w-full cursor-pointer items-center min-h-14 gap-2 rounded-element border-0 bg-transparent px-2 py-2 text-left transition-colors hover:bg-surface-container"
                  >
                    <RouteBullet type={hit.type} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{name}</span>
                      {meta && (
                        <span className="block truncate text-13 text-muted-foreground">{meta}</span>
                      )}
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* The mode row sits right under the tiles it re-biases. */}
      <div className="border-t border-border-hairline">
        <Eyebrow>{t('header.modeLabel', 'Mode')}</Eyebrow>
        <ModeSwitcher />
      </div>

      {/* Every browse route stays reachable — the intent row is additive, never
          a replacement — but it is demoted behind a disclosure so the two
          models are not presented as peers. */}
      <details className="group px-4 py-2 sm:px-6">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          {t('header.intents.browseHeading', 'Browse everything')}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="pt-2">
          {NAV_CLUSTERS.map((cluster) => {
            const items = DESTINATIONS.filter((d) => d.cluster === cluster.id);
            if (items.length === 0) return null;
            return (
              <div key={cluster.id} className="mb-4 last:mb-0">
                <div className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {t(cluster.labelKey)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => onBrowse(item.to)}
                      className={CHIP}
                    >
                      {t(item.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </details>
      <button
        type="button"
        onClick={onAsk}
        className="sticky bottom-0 z-10 flex min-h-14 w-full shrink-0 items-center gap-2 border-t border-border-hairline bg-card px-4 py-2 text-left text-sm font-semibold transition-colors hover:bg-surface-container sm:px-6"
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        {t('search.ask.entry', 'Ask the guide a question')}
        <span className="ml-auto shrink-0" aria-hidden>
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
