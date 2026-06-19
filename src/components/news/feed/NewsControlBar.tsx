import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Globe, MapPin, SlidersHorizontal, Rows3, Rows4, ArrowUpDown } from 'lucide-react';
import { TopicChip } from './TopicChip';
import type { NewsDensity } from '@/hooks/useNewsDensity';

export interface NewsTopic {
  slug: string;
  label: string;
}

export type NewsSort = 'latest' | 'most-read';

interface CountryOption {
  id: string;
  name: string;
  article_count?: number;
}

interface NewsControlBarProps {
  topics: NewsTopic[];
  selectedTopics: string[];
  onToggleTopicFilter: (slug: string) => void;
  isFollowed: (slug: string) => boolean;
  onToggleFollow: (slug: string) => void;
  selectedCountry: string;
  onCountryChange: (id: string) => void;
  homeCountryId?: string | null;
  sort: NewsSort;
  onSortChange: (s: NewsSort) => void;
  density: NewsDensity;
  onDensityChange: (d: NewsDensity) => void;
}

// Sticky in-place control bar below the tab segmented control. Topic chips
// follow + filter; region/sort/density filter the active feed client-side. Deep
// filters (source, date range) stay on /news/all. On mobile the non-chip
// controls collapse into a bottom Sheet.
export function NewsControlBar({
  topics,
  selectedTopics,
  onToggleTopicFilter,
  isFollowed,
  onToggleFollow,
  selectedCountry,
  onCountryChange,
  homeCountryId,
  sort,
  onSortChange,
  density,
  onDensityChange,
}: NewsControlBarProps) {
  const { t } = useTranslation();
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await supabase.rpc('news_countries_with_articles');
      if (!cancelled && !res.error && Array.isArray(res.data)) {
        setCountries(res.data as CountryOption[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const DensityToggle = (
    <div
      className="flex items-center rounded-element border border-border p-1"
      role="group"
      aria-label={t('pages.news.density', 'Density')}
    >
      <Button
        variant={density === 'comfortable' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onDensityChange('comfortable')}
        aria-pressed={density === 'comfortable'}
        aria-label={t('pages.news.comfortable', 'Comfortable')}
        title={t('pages.news.comfortable', 'Comfortable')}
        style={{ height: 32, width: 32, padding: 0 }}
      >
        <Rows3 size={16} />
      </Button>
      <Button
        variant={density === 'compact' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onDensityChange('compact')}
        aria-pressed={density === 'compact'}
        aria-label={t('pages.news.compact', 'Compact')}
        title={t('pages.news.compact', 'Compact')}
        style={{ height: 32, width: 32, padding: 0 }}
      >
        <Rows4 size={16} />
      </Button>
    </div>
  );

  const RegionSelect = (
    <Select
      value={selectedCountry || 'all'}
      onValueChange={(v) => onCountryChange(v === 'all' ? '' : v)}
    >
      <SelectTrigger aria-label={t('pages.news.region', 'Region')} className="min-w-[140px]">
        <Globe size={16} className="mr-2 shrink-0" />
        <SelectValue placeholder={t('pages.news.region', 'Region')} />
      </SelectTrigger>
      <SelectContent style={{ maxHeight: 280, overflowY: 'auto' }}>
        <SelectItem value="all">{t('pages.news.allRegions', 'All regions')}</SelectItem>
        {countries.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {c.article_count ? ` (${c.article_count})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const SortSelect = (
    <Select value={sort} onValueChange={(v) => onSortChange(v as NewsSort)}>
      <SelectTrigger aria-label={t('pages.news.sort', 'Sort')} className="min-w-[130px]">
        <ArrowUpDown size={16} className="mr-2 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="latest">{t('pages.news.sortLatest', 'Latest')}</SelectItem>
        <SelectItem value="most-read">{t('pages.news.sortMostRead', 'Most read')}</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-3 mb-8 bg-surface-container-low/95 backdrop-blur supports-[backdrop-filter]:bg-surface-container-low/75 border-b border-hairline">
      <div className="flex items-center gap-3">
        {/* Topic chips — horizontal scroll */}
        <div
          className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none' }}
          aria-label={t('pages.news.topics', 'Topics')}
        >
          {homeCountryId && (
            <Button
              variant={selectedCountry === homeCountryId ? 'accent' : 'outline'}
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => onCountryChange(selectedCountry === homeCountryId ? '' : homeCountryId)}
            >
              <MapPin size={14} />
              {t('pages.news.nearMe', 'Near me')}
            </Button>
          )}
          {topics.map((topic) => (
            <TopicChip
              key={topic.slug}
              slug={topic.slug}
              label={topic.label}
              active={selectedTopics.includes(topic.slug)}
              followed={isFollowed(topic.slug)}
              onToggleFilter={onToggleTopicFilter}
              onToggleFollow={onToggleFollow}
            />
          ))}
        </div>

        {/* Desktop controls */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {RegionSelect}
          {SortSelect}
          {DensityToggle}
        </div>

        {/* Mobile controls in a sheet */}
        <div className="md:hidden shrink-0">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal size={16} />
                {t('pages.news.controls', 'Controls')}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-container">
              <SheetHeader>
                <SheetTitle>{t('pages.news.controls', 'Controls')}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-6 pt-6 pb-8">
                <label className="flex flex-col gap-2">
                  <span className="text-13 font-medium text-muted-foreground">
                    {t('pages.news.region', 'Region')}
                  </span>
                  {RegionSelect}
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-13 font-medium text-muted-foreground">
                    {t('pages.news.sort', 'Sort')}
                  </span>
                  {SortSelect}
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-13 font-medium text-muted-foreground">
                    {t('pages.news.density', 'Density')}
                  </span>
                  {DensityToggle}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}

// Apply the control-bar filters + sort to a candidate list, client-side.
// sort='ranked' keeps the incoming order (used by For You, whose ranking IS the order).
export function applyNewsControls<T extends Record<string, unknown> & { id: string }>(
  list: T[],
  opts: { selectedTopics: string[]; selectedCountry: string; sort: NewsSort | 'ranked' },
): T[] {
  const { selectedTopics, selectedCountry, sort } = opts;
  let out = list;

  if (selectedCountry) {
    out = out.filter((a) => ((a.country_ids as string[] | undefined) ?? []).includes(selectedCountry));
  }

  if (selectedTopics.length > 0) {
    const want = new Set(selectedTopics.map((s) => s.toLowerCase()));
    out = out.filter((a) => {
      const cc = String((a.category_canonical as string) ?? '').toLowerCase();
      const cat = String((a.category as string) ?? '').toLowerCase();
      if (want.has(cc) || want.has(cat)) return true;
      return ((a.tags as string[] | undefined) ?? []).some((t) => want.has(String(t).toLowerCase()));
    });
  }

  if (sort === 'ranked') return out;

  return [...out].sort((a, b) => {
    if (sort === 'most-read') {
      return ((b.views_count as number) ?? 0) - ((a.views_count as number) ?? 0);
    }
    return (
      new Date((b.published_at as string) ?? 0).getTime() -
      new Date((a.published_at as string) ?? 0).getTime()
    );
  });
}
