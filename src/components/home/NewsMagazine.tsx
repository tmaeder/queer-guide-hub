import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Band } from './Band';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterChip } from '@/components/transit/FilterChip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useNewsFront, type NewsFrontArticle } from '@/hooks/useNewsFront';
import { useHomeRegionContext } from './homeRegionContext';
import { useEditorsPick } from '@/hooks/useEditorsPick';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useStoryCountsForArticles } from '@/hooks/useNewsStories';
import { useFollowedTags } from '@/hooks/useFollowedTags';
import { useTagSearch } from '@/hooks/useTagSearch';
import { useAuth } from '@/hooks/useAuth';
import { ExternalImg } from '@/components/ui/ExternalImg';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getFallbackImage } from '@/utils/fallbackImages';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';
import { resolvePublisherName } from '@/lib/publisherName';
import { localizedNewsTitle } from '@/lib/newsTitle';
import { timeAgo } from '@/utils/timezone';

type Article = Pick<NewsFrontArticle, 'id' | 'slug' | 'title' | 'published_at'> &
  Partial<
    Pick<
      NewsFrontArticle,
      | 'excerpt'
      | 'image_url'
      | 'publisher_name'
      | 'is_read'
      | 'category_canonical'
      | 'media_type'
      | 'title_i18n'
      | 'personal_score'
    >
  >;

/** Ask for a superset so a topic slice still has depth behind it. Podcasts is
 *  the thinnest slice at ~11% of the corpus, i.e. ~9 rows out of 80. */
const POOL = 80;
/**
 * Lead + this many dense rows before the disclosure.
 *
 * Eight, not five, and the number is measured rather than chosen: the grid
 * stretches both columns to the lead's height (657px at 1440w) and a row is
 * 77px, so five rows left 272px of dead space beside the lead. Eight fills the
 * column and buys three more stories above the fold for nothing.
 */
const TIER_ONE_ROWS = 8;
/** Ceiling on the disclosure. Sixteen stories in total. */
const TIER_TWO_MAX = 7;
/** Below this, a disclosure opens onto almost nothing and is worse than none. */
const MIN_DISCLOSURE = 3;
/** Below this a topic chip can only render a near-empty band, so it is
 *  disabled rather than allowed to resolve to a dead end. */
const MIN_CHIP_ITEMS = 3;

const TOPIC_STORE_KEY = 'qg_news_topic';
/** Matches the region chip. Long enough to survive a day's browsing, short
 *  enough that the device is not carrying a durable record of what someone
 *  reads — see the reasoning in useHomeRegion. */
const TOPIC_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The shipped topic set, and the three categories are not an arbitrary subset.
 * Measured over a 21-day window: rights-legal 483, community 381,
 * culture-arts 311 — together 80% of 1,472 eligible articles, each deep enough
 * to fill both tiers every day. The eight that are NOT here are: politics 97,
 * health-wellness 54, technology 53, sports 42, general 20, education 16,
 * business-economy 13, international 2. A chip resolving to a two-card grid
 * reads as "the scene is dead here" rather than "we have thin coverage", which
 * is the trap PresetChips documents for the events corpus. `general` is the
 * unclassified bucket and is already hidden by NewsCard's own category filter;
 * promoting it to a public facet would advertise the classification gap.
 *
 * Podcasts is not a category — it is `media_type`, a different KIND of thing —
 * which is why it sits at the end rather than among the taxonomy chips.
 */
type TopicId = 'all' | 'rights-legal' | 'community' | 'culture-arts' | 'podcasts';

const TOPICS: ReadonlyArray<{ id: TopicId; key: string; fallback: string }> = [
  { id: 'all', key: 'home.news.topic.all', fallback: 'All' },
  { id: 'rights-legal', key: 'home.news.topic.rights', fallback: 'Rights & Legal' },
  { id: 'community', key: 'home.news.topic.community', fallback: 'Community' },
  { id: 'culture-arts', key: 'home.news.topic.culture', fallback: 'Culture & Arts' },
  { id: 'podcasts', key: 'home.news.topic.podcasts', fallback: 'Podcasts' },
];

function matchesTopic(a: Article, topic: TopicId): boolean {
  if (topic === 'all') return true;
  if (topic === 'podcasts') return a.media_type === 'podcast';
  return a.category_canonical === topic;
}

/** Read once, in a lazy initializer rather than an effect. The band mounts
 *  inside DeferredSection behind lazyOptional, so this always runs client-side
 *  after paint; and main.tsx uses createRoot rather than hydrateRoot, so there
 *  is no hydration pass for a storage read to mismatch. The crawler body keeps
 *  emitting the unfiltered band because the absent default is `all`. */
function readStoredTopic(): TopicId {
  try {
    const raw = sessionStorage.getItem(TOPIC_STORE_KEY);
    if (!raw) return 'all';
    const parsed = JSON.parse(raw) as { id?: string; ts?: number };
    if (!parsed?.id || typeof parsed.ts !== 'number') return 'all';
    if (Date.now() - parsed.ts > TOPIC_TTL_MS) return 'all';
    return TOPICS.some((t) => t.id === parsed.id) ? (parsed.id as TopicId) : 'all';
  } catch {
    return 'all';
  }
}

function storeTopic(id: TopicId) {
  try {
    if (id === 'all') sessionStorage.removeItem(TOPIC_STORE_KEY);
    else sessionStorage.setItem(TOPIC_STORE_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    /* private mode — the filter still works, it just will not persist */
  }
}

/**
 * Topics worth SUGGESTING in the follow picker. Chosen by how much of the live
 * pool each one would actually boost, which is the only thing that decides
 * whether a follow expresses a preference or just re-weights everything.
 *
 * Measured against the real 80-row pool: transgender 47.5%, gay 38.8%, queer
 * 33.8%, lgbtqia-rights 21.3% — versus lesbian 12.5%, sports 7.5%, politics
 * 7.5%, drag 5.0%, hate-crimes 3.8%, representation 3.8%, bisexual 2.5%,
 * human-rights 2.5%, film 1.3%.
 *
 * So the identity mega-tags are deliberately NOT suggested. Following
 * `transgender` boosts nearly half the band, which is the same objection that
 * rules out `lgbtqia+` (990 articles, 67% of the corpus, and no `unified_tags`
 * row to follow in the first place). They stay findable through search — a
 * reader who wants one can have it — but recommending a filter that changes
 * almost nothing would be misleading. `film` is dropped from the other end for
 * the opposite reason: at 1.3% it would rarely surface anything.
 */
const SUGGESTED_FOLLOWS = [
  'lesbian',
  'drag',
  'bisexual',
  'hate crimes',
  'human rights',
  'sports',
  'politics',
];

/**
 * Follow a topic to steer the ranking.
 *
 * This feeds a boost that already exists and has never had an input:
 * `get_news_front`'s `followed` CTE matches `unified_tags.slug`/`.name` against
 * `news_articles.tags` and multiplies hotness by 1.4. Measured, 376 distinct
 * article tags resolve to a real tag row across 4,857 occurrences, so the join
 * has genuine overlap — but `tag_follows` held ZERO rows, so the boost could
 * never fire for anyone.
 *
 * Deliberately NOT `FollowedTagsRail`, which does the same job on /news: every
 * string in it is hardcoded English on a localized page, it renders a bordered
 * Card, and it sets font sizes through inline `style` which bypasses the token
 * system. Only the hook is shared.
 */
function FollowTopicsChip() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { followedTags, toggleFollow } = useFollowedTags();
  const { results, search } = useTagSearch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Signed-out readers have nothing to follow with; the chip row above is
  // their control. Same contract as FollowedTagsRail.
  if (!user) return null;

  const showing = query.trim().length >= 2 ? results : [];
  const followedIds = new Set(followedTags.map((f) => f.tagId));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip
          active={open}
          label={
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <span>
                {followedTags.length > 0
                  ? t('home.news.following', 'Following {{count}}', {
                      count: followedTags.length,
                    })
                  : t('home.news.followTopics', 'Follow topics')}
              </span>
            </>
          }
          aria-label={t('home.news.followTopics', 'Follow topics')}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 bg-muted rounded-element p-0">
        <div className="border-b border-border-hairline p-2">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              void search(e.target.value);
            }}
            placeholder={t('home.news.searchTopics', 'Search topics…')}
            aria-label={t('home.news.searchTopics', 'Search topics…')}
          />
        </div>
        <ul className="m-0 max-h-64 list-none overflow-auto p-0">
          {followedTags.map((tag) => (
            <li key={tag.tagId}>
              <button
                type="button"
                onClick={() => toggleFollow({ tagId: tag.tagId, name: tag.name, slug: tag.slug })}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-start text-13 font-bold hover:bg-foreground hover:text-background"
              >
                <span className="truncate">{tag.name}</span>
                <span className="shrink-0 opacity-70">{t('home.news.unfollow', 'Unfollow')}</span>
              </button>
            </li>
          ))}
          {showing
            .filter((r) => !followedIds.has(r.id))
            .map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    toggleFollow({ tagId: r.id, name: r.name, slug: r.slug });
                    setQuery('');
                  }}
                  className="w-full truncate px-4 py-2 text-start text-13 hover:bg-foreground hover:text-background"
                >
                  {r.name}
                </button>
              </li>
            ))}
          {query.trim().length < 2 && (
            <li className="px-4 py-2 text-2xs uppercase tracking-label text-muted-foreground">
              {t('home.news.trySearching', 'Try: {{list}}', {
                list: SUGGESTED_FOLLOWS.slice(0, 4).join(', '),
              })}
            </li>
          )}
          {query.trim().length >= 2 && showing.length === 0 && (
            <li className="px-4 py-4 text-13 text-muted-foreground">
              {t('home.news.noTopic', 'No topic by that name.')}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Timestamp · publisher · outlet count. Plain text in every segment: an
 *  outlet count is a FACT about the story, not a state, so it needs no colour —
 *  and a link here would nest inside the row's own anchor, which trips axe
 *  `nested-interactive`. */
function meta(a: Article, outlets?: number): string {
  return [
    timeAgo(a.published_at),
    resolvePublisherName({ publisherName: a.publisher_name }),
    outlets && outlets >= 2 ? `${outlets} outlets` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Row({ a, title, outlets }: { a: Article; title: string; outlets?: number }) {
  return (
    <LocalizedLink
      to={`/news/${a.slug}`}
      data-news-row
      className="group grid grid-cols-[3.5rem_1fr] gap-2 border-b border-border-hairline py-2.5 no-underline last:border-b-0"
    >
      <span className="pt-0.5 text-2xs font-semibold uppercase tabular-nums tracking-label text-muted-foreground">
        {timeAgo(a.published_at)}
      </span>
      <span className="min-w-0">
        <span className="block text-15 font-semibold leading-tight tracking-tight line-clamp-2 transition-opacity group-hover:opacity-70">
          {decodeHtmlEntities(title)}
        </span>
        <span className="mt-1 block truncate text-2xs uppercase tracking-label text-muted-foreground">
          {[
            resolvePublisherName({ publisherName: a.publisher_name }),
            outlets && outlets >= 2 ? `${outlets} outlets` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </LocalizedLink>
  );
}

/**
 * The homepage news band.
 *
 * It used to render 5 stories out of a 24-row pool through a 6-hour rotation
 * window. Three things were wrong with that, all measured:
 *
 *  1. `rotateWindow` strides a FULL PAGE per bucket, so for roughly eighteen
 *     hours a day the homepage lead was not the top-ranked story but rank 6, 11
 *     or 16. Rotation was written for a corpus that does not move; this one
 *     publishes ~88 articles a day and turns its own pool over every ~6h, so
 *     rotation had stopped adding variety and started subtracting relevance.
 *  2. The meta line rendered `MMM d, yyyy`, so a story published ninety minutes
 *     ago was labelled with a date and read as archive.
 *  3. Five items is 0.34% of the 1,472 eligible articles in the window.
 *
 * So: no rotation, relative timestamps, and sixteen stories in roughly the old
 * height by spending 40px on a row instead of 140px on an image card.
 *
 * Variety on a return visit now comes from the corpus itself (the pool has
 * genuinely moved), from `is_read` demotion, and from timestamps that change on
 * their own — not from deliberately showing something further down the ranking.
 */
const NewsMagazine = React.memo(() => {
  const { t, i18n } = useTranslation();
  const region = useHomeRegionContext();

  // Geo is a BOOST here, never a filter — see useNewsFront. Region-filtering
  // was measured and rejected: Germany has 3 eligible articles in a 7-day
  // window against 144 for the US, so a filter hands most European visitors an
  // empty band.
  const front = useNewsFront(POOL, 21, {
    countryIds: region.countryId ? [region.countryId] : null,
    cityIds: region.cityId ? [region.cityId] : null,
  });
  const editorsPick = useEditorsPick();

  const [topic, setTopic] = useState<TopicId>(readStoredTopic);

  const pool = front.articles as unknown as Article[];

  // Order is frozen per fetch because `pool` is react-query's `data`, whose
  // reference is stable between fetches. That is the one job the old 6-hour
  // bucket still did that is worth doing: without it the 5-minute poll in
  // LIVE_OPTS can reorder the list under someone mid-read.
  const ranked = useMemo(() => {
    const pick = editorsPick as Article | null;
    const rest = pool.filter((a) => a.id !== pick?.id);
    return [...(pick ? [pick] : [])].concat(
      [...rest].sort((a, b) => {
        // Already-read sinks first: the piece you just opened should not still
        // be the headline.
        const read = Number(a.is_read ?? false) - Number(b.is_read ?? false);
        if (read !== 0) return read;
        // Then the RPC's own personalized score, which folds in the geo boost
        // (×1.25) and, for a signed-in reader with follows, the tag boost
        // (×1.4). The RPC's ORDER BY uses raw hotness in this branch, so this
        // sort is what makes either boost visible at all.
        return (b.personal_score ?? 0) - (a.personal_score ?? 0);
      }),
    );
  }, [pool, editorsPick]);

  // Chip availability is derived from the pool in hand rather than a stored
  // 21-day count: a count describes a period the reader is not looking at, and
  // goes wrong the moment the geo boost re-ranks. Zero query cost.
  const counts = useMemo(() => {
    const m = new Map<TopicId, number>();
    for (const { id } of TOPICS) m.set(id, ranked.filter((a) => matchesTopic(a, id)).length);
    return m;
  }, [ranked]);

  const filtered = useMemo(() => ranked.filter((a) => matchesTopic(a, topic)), [ranked, topic]);

  const shown = useMemo(() => filtered.slice(0, 1 + TIER_ONE_ROWS + TIER_TWO_MAX), [filtered]);
  const ids = useMemo(() => shown.map((a) => a.id), [shown]);
  const { assets } = useEntityImageAssets('news_article', ids);
  const storyCounts = useStoryCountsForArticles(ids);

  if (front.error || (!front.loading && shown.length === 0)) return null;

  const head = {
    title: t('home.news.title', 'Latest News'),
    seeAllHref: '/news',
    seeAllLabel: t('common.allStories', 'All stories'),
  };

  if (front.loading && shown.length === 0) {
    return (
      <Band {...head}>
        <div className="mb-6 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-element" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
          <Skeleton className="aspect-[16/10] w-full rounded-container" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: TIER_ONE_ROWS }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-element" />
            ))}
          </div>
        </div>
      </Band>
    );
  }

  const [lead, ...rest] = shown;
  const tierOne = rest.slice(0, TIER_ONE_ROWS);
  const tierTwo = rest.slice(TIER_ONE_ROWS);
  const leadTitle = localizedNewsTitle(lead, i18n.language);

  const leadImg =
    resolveImageUrl({
      imageUrl: lead.image_url,
      optimizedUrl: assets.get(lead.id)?.optimized_url ?? null,
      thumbnailUrl: assets.get(lead.id)?.thumbnail_url ?? null,
    }) || null;

  return (
    <Band {...head} action={<FollowTopicsChip />}>
      {/* One scrollable LINE, never flex-wrap — the events control bar's rule.
          This sits under a text-display h2, so a second line would push the
          lead image down on every phone. */}
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 snap-x">
        <div
          className="flex gap-2"
          role="tablist"
          aria-label={t('home.news.topics', 'News topics')}
        >
          {TOPICS.map(({ id, key, fallback }) => {
            const n = counts.get(id) ?? 0;
            // Never HIDDEN, only disabled: an absent chip reads as a missing
            // feature, a greyed one reads as thin coverage, which is the truth.
            const disabled = id !== 'all' && n < MIN_CHIP_ITEMS;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={topic === id}
                disabled={disabled}
                onClick={() => {
                  setTopic(id);
                  storeTopic(id);
                }}
                className={[
                  'inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-element px-2.5 text-13 font-bold',
                  'transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  topic === id
                    ? 'bg-foreground text-background'
                    : 'bg-background text-foreground hover:bg-foreground hover:text-background',
                  disabled
                    ? 'cursor-not-allowed opacity-50 hover:bg-background hover:text-foreground'
                    : '',
                ].join(' ')}
              >
                {t(key, fallback)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
        {/* Lead story */}
        <LocalizedLink to={`/news/${lead.slug}`} className="group block no-underline">
          <div className="mb-6 aspect-[16/10] overflow-hidden rounded-container bg-muted">
            <ExternalImg
              src={leadImg}
              cfWidth={1000}
              fallbackSrc={getFallbackImage('news', lead.id)}
              alt=""
              aria-hidden
              className="h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.02]"
            />
          </div>
          <Eyebrow as="div" className="mb-4">
            {editorsPick?.id === lead.id
              ? `${t('home.news.editorsPick', "Editors' pick")} · ${meta(lead, storyCounts.get(lead.id)?.count)}`
              : meta(lead, storyCounts.get(lead.id)?.count)}
          </Eyebrow>
          {/* A card headline must never match the section heading above it. */}
          <h3 className="text-headline font-bold leading-[1.05] tracking-tight line-clamp-3 transition-opacity group-hover:opacity-80">
            {decodeHtmlEntities(leadTitle)}
          </h3>
          {lead.excerpt && (
            <p className="mt-4 text-15 md:text-base text-muted-foreground leading-[1.5] line-clamp-3">
              {decodeHtmlEntities(lead.excerpt)}
            </p>
          )}
        </LocalizedLink>

        {/* Tier one — dense rows. A 40px row instead of a 140px image card is
            what buys three times the stories in the same band height. */}
        {tierOne.length > 0 && (
          <div className="flex flex-col">
            {tierOne.map((a) => (
              <Row
                key={a.id}
                a={a}
                title={localizedNewsTitle(a, i18n.language)}
                outlets={storyCounts.get(a.id)?.count}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tier two — native <details>, not ui/accordion or ui/collapsible.
          It needs no JS and no state, and every headline stays in the DOM with
          the disclosure CLOSED, so a crawler sees all sixteen. An animated
          height would also have to be gated behind prefers-reduced-motion;
          an instant reveal has nothing to gate. */}
      {tierTwo.length >= MIN_DISCLOSURE && (
        <details className="mt-8 border-t border-border-hairline pt-4">
          <summary className="cursor-pointer list-none text-15 font-bold [&::-webkit-details-marker]:hidden">
            {t('home.news.moreStories', '{{count}} more stories', { count: tierTwo.length })} →
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-x-10 md:grid-cols-2">
            {tierTwo.map((a) => (
              <Row
                key={a.id}
                a={a}
                title={localizedNewsTitle(a, i18n.language)}
                outlets={storyCounts.get(a.id)?.count}
              />
            ))}
          </div>
        </details>
      )}
    </Band>
  );
});
NewsMagazine.displayName = 'NewsMagazine';

export default NewsMagazine;
