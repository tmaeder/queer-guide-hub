import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type SearchHit } from '@/lib/searchClient';
import { DESTINATIONS, NAV_CLUSTERS } from '@/config/navigation';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { Image } from '@/components/ui/Image';

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

      {tiles.length > 0 && (
        <>
          <Eyebrow>{heading}</Eyebrow>
          {/* Two-column cards, not a list: each says what it is (type mark or
              photo), what it is called and where. Trending hits rarely carry
              an image, so the card is built to look finished without one. */}
          <ul className="m-0 grid list-none grid-cols-1 gap-2 px-6 pb-2 min-[360px]:grid-cols-2">
            {tiles.map((hit) => {
              const name = (hit.title || hit.name || '') as string;
              if (!name) return null;
              const meta = [hit.city, hit.country].filter(Boolean).join(' · ');
              const img = hit.thumbnail_url || hit.optimized_url || hit.image_url || null;
              return (
                <li key={`trend-${hit.type}-${hit.id}`} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectTrending(hit)}
                    className="group flex h-full w-full cursor-pointer items-center gap-2 rounded-element bg-card p-2 text-left shadow-soft transition-colors hover:bg-surface-container"
                  >
                    {img ? (
                      <span className="w-10 shrink-0 overflow-hidden rounded-badge">
                        <Image
                          src={img}
                          alt=""
                          aspect="square"
                          rounded="none"
                          imageRole="thumb"
                          sizes="40px"
                          fallbackArtwork={
                            <span className="grid h-full place-items-center">
                              <RouteBullet type={hit.type} size={28} />
                            </span>
                          }
                        />
                      </span>
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center">
                        <RouteBullet type={hit.type} size={30} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-15 font-bold leading-tight group-hover:underline">
                        {name}
                      </span>
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

      <div className="mt-4 border-t border-border-hairline">
        <button
          type="button"
          onClick={onAsk}
          className="flex min-h-11 w-full items-center gap-2 border-b border-border-hairline px-6 py-4 text-left text-15 font-bold transition-colors hover:bg-surface-container"
        >
          {t('search.ask.entry', 'Ask the guide a question')}
          <span className="ml-auto shrink-0" aria-hidden>
            →
          </span>
        </button>

        {/* Every browse route stays reachable — the intent row is additive, never
          a replacement — but it is demoted behind a disclosure so the two
          models are not presented as peers. */}
        <details className="group/browse border-b border-border-hairline">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-6 py-4 text-15 font-bold transition-colors hover:bg-surface-container [&::-webkit-details-marker]:hidden">
            {t('header.intents.browseHeading', 'Browse everything')}
            <span
              className="ml-auto shrink-0 transition-transform group-open/browse:rotate-90"
              aria-hidden
            >
              →
            </span>
          </summary>
          <div className="px-6 pb-6">
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
    </div>
  );
}
