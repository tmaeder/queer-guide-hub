import type { ReactNode } from 'react';
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
    <div className="px-6 pb-2 pt-4 text-2xs font-bold uppercase tracking-label text-muted-foreground">
      {children}
    </div>
  );
}

/** Bordered chip that inverts to ink on hover — the mock's only chip state.
 *  It fills rather than lifts: at chip scale a 5px hard shadow is larger than
 *  the chip's own padding and the row turns into a stack of dominoes. */
const CHIP =
  'inline-flex cursor-pointer items-center gap-2 bg-transparent px-4 py-1.5 text-13 font-bold text-foreground transition-colors hover:bg-foreground hover:text-background';

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
    <div className="min-h-0 flex-1">
      {recentItems.length > 0 && onSelectRecent && (
        <>
          <Eyebrow>{t('search.recent', 'Recent')}</Eyebrow>
          <div className="flex flex-wrap items-center gap-2 px-6 pb-2">
            {recentItems.map((term, i) => (
              <button
                key={`recent-${i}`}
                type="button"
                onClick={() => onSelectRecent(term)}
                className={`${CHIP} max-w-[200px]`}
              >
                <span className="truncate">{term}</span>
              </button>
            ))}
            {onClearRecents && (
              <button
                type="button"
                onClick={onClearRecents}
                aria-label={t('search.clearRecent', 'Clear')}
                className="cursor-pointer bg-transparent p-1 text-13 text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t('search.clearRecent', 'Clear')}
              </button>
            )}
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
      <div className="flex flex-wrap gap-2 px-6 pb-2">
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
          <ul className="px-6 pb-2">
            {tiles.map((hit) => {
              const name = (hit.title || hit.name || '') as string;
              if (!name) return null;
              const meta = [hit.city, hit.country].filter(Boolean).join(' · ');
              return (
                <li key={`trend-${hit.type}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelectTrending(hit)}
                    className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-0 py-2 text-left transition-colors hover:bg-surface-container"
                  >
                    <RouteBullet type={hit.type} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-15 font-bold">{name}</span>
                      {meta && (
                        <span className="block truncate text-13 text-muted-foreground">{meta}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* The mode row sits right under the tiles it re-biases. */}
      <ModeSwitcher />

      <button
        type="button"
        onClick={onAsk}
        className="flex w-full items-center gap-2 border-y border-border-hairline px-6 py-4 text-left text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
      >
        {t('search.ask.entry', 'Ask the guide a question')}
        <span className="ml-auto shrink-0" aria-hidden>
          →
        </span>
      </button>

      {/* Every browse route stays reachable — the intent row is additive, never
          a replacement — but it is demoted behind a disclosure so the two
          models are not presented as peers. */}
      <details className="px-6 pb-6 pt-2">
        <summary className="cursor-pointer list-none text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {t('header.intents.browseHeading', 'Browse everything')}
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
    </div>
  );
}
