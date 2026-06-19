import React, { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { type CentralizedTag } from '@/hooks/useCentralizedTags';
import { RelatedTagsCard } from '@/components/tags/RelatedTagsCard';
import { TagLinkedContent } from '@/components/tags/TagLinkedContent';
import {
  getCategoryShortName,
} from '@/components/resources/categoryMeta';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { TagDetailWithGate } from '@/components/age-gate/TagDetailWithGate';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { ArrowLeft, ChevronRight, ChevronDown, ExternalLink, Network, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TagRelationshipGraph = lazy(() => import('@/components/tags/TagRelationshipGraph'));

/**
 * Pull a small set of human-readable key/value facts out of `scientific_data`
 * (Wolfram/Wikidata enrichment). We only surface flat primitive entries — the
 * blob can hold nested objects we don't want to dump raw. Restrained on purpose
 * (wiki-dense was explicitly not the chosen direction).
 */
function extractFacts(data: Record<string, unknown> | null | undefined): [string, string][] {
  if (!data || typeof data !== 'object') return [];
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    if (typeof value === 'object') continue;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    out.push([label, String(value)]);
    if (out.length >= 6) break;
  }
  return out;
}

interface ResourceTagDetailProps {
  selectedTag: CentralizedTag;
  onNavigate: (path: string) => void;
  onSetViewMode: (mode: 'overview' | 'category' | 'subcategory') => void;
  onSetSelectedCategory: (name: string) => void;
  onSetSelectedSubcategory: (name: string) => void;
  onTagClick: (tag: CentralizedTag) => void;
}

export function ResourceTagDetail({
  selectedTag,
  onNavigate,
  onSetViewMode,
  onSetSelectedCategory,
  onSetSelectedSubcategory,
  onTagClick,
}: ResourceTagDetailProps) {
  const { t } = useTranslation();
  const safeMode = useSafeMode();
  const ageAffirmation = useAgeAffirmation();

  // Honour the SEO sensitivity gate: sensitive/adult tags not yet human-reviewed
  // carry seo_indexable=false (enforce_tag_seo_sensitivity_gate). Keep the page
  // reachable but inject noindex so unreviewed sensitive terms never enter search
  // results (outing/mislabel-risk protection). Mirrors CityDetail's pattern.
  const noIndex = selectedTag.seo_indexable === false;
  React.useEffect(() => {
    if (!noIndex) return;
    let el = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const hadTag = !!el;
    const prev = el?.getAttribute('content') ?? null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    el.setAttribute('content', 'noindex,nofollow');
    return () => {
      if (!hadTag) document.querySelector('meta[name="robots"]')?.remove();
      else if (prev !== null) el?.setAttribute('content', prev);
    };
  }, [noIndex]);

  const primary =
    selectedTag.categories?.find((c) => c.is_primary) ?? selectedTag.categories?.[0];
  const parentName = primary?.parent_name ?? undefined;
  const childName = primary?.level === 1 ? primary.name : undefined;
  const tagCategoryNames = [
    ...(selectedTag.categories?.map((c) => c.name) ?? []),
    ...(selectedTag.categories?.map((c) => c.parent_name ?? null) ?? []),
  ];
  const isAdult = tagCategoryNames.some((n) => safeMode.isAdultCategory(n));

  const facts = extractFacts(selectedTag.scientific_data);
  const [graphOpen, setGraphOpen] = React.useState(false);

  return (
    <TagDetailWithGate
      isAdult={isAdult}
      affirmed={ageAffirmation.affirmed}
      onDecline={() => {
        onNavigate('/resources');
        onSetViewMode('overview');
      }}
    >
    <div className="container mx-auto py-8 md:py-16 px-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <button
          onClick={() => {
            onNavigate('/resources');
            onSetViewMode('overview');
          }}
          className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
        >
          <ArrowLeft size={14} />
          <span className="text-sm">{t('resources.tagDetail.breadcrumbHome')}</span>
        </button>
        {parentName && (
          <>
            <ChevronRight size={14} className="text-muted-foreground" />
            <button
              onClick={() => {
                onSetSelectedCategory(parentName);
                onSetSelectedSubcategory('');
                onSetViewMode('category');
                onNavigate('/resources');
              }}
              className="bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
            >
              <span className="text-sm">{getCategoryShortName(parentName)}</span>
            </button>
          </>
        )}
        {childName && (
          <>
            <ChevronRight size={14} className="text-muted-foreground" />
            <button
              onClick={() => {
                onSetSelectedCategory(parentName || childName);
                onSetSelectedSubcategory(childName);
                onSetViewMode('subcategory');
                onNavigate('/resources');
              }}
              className="bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
            >
              <span className="text-sm">{getCategoryShortName(childName)}</span>
            </button>
          </>
        )}
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium">{selectedTag.name}</span>
      </div>

      {/* Hero — only show image box when tag has an image */}
      {selectedTag.image_url ? (
        <div
          className="w-full rounded-container overflow-hidden mb-6 relative bg-muted"
          style={{ aspectRatio: '16 / 9' }}
        >
          <img
            src={selectedTag.image_url}
            alt={selectedTag.name}
            role="presentation"
            className="w-full h-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div
            className="absolute inset-0 flex flex-col justify-end p-6 sm:p-6"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)' }}
          >
            {primary && (
              <p className="font-semibold mb-1 uppercase text-white/65" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                {parentName ? `${getCategoryShortName(parentName)} › ` : ''}
                {getCategoryShortName(primary.name)}
              </p>
            )}
            <h1 className="text-2xl font-bold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)', lineHeight: 1.1 }}>
              {selectedTag.name}
            </h1>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          {primary && (
            <p className="text-sm text-muted-foreground mb-1">
              {parentName ? `${getCategoryShortName(parentName)} › ` : ''}
              {getCategoryShortName(primary.name)}
            </p>
          )}
          <h1 className="text-2xl font-bold">{selectedTag.name}</h1>
        </div>
      )}

      {selectedTag.image_url && selectedTag.image_attribution && (
        <p className="text-xs text-muted-foreground -mt-4 mb-6" style={{ maxWidth: 680 }}>
          {selectedTag.image_attribution}
        </p>
      )}

      {/* Definition lede + long-form explanation */}
      {selectedTag.description && (
        <p className="mb-4" style={{ lineHeight: 1.7, maxWidth: 680, fontSize: '0.95rem' }}>
          {selectedTag.description}
        </p>
      )}

      {!selectedTag.description && !selectedTag.long_description && (
        <p className="text-muted-foreground mb-4 italic" style={{ fontSize: '0.85rem', opacity: 0.6 }}>
          {t('resources.tagDetail.noDefinition')}
        </p>
      )}

      {selectedTag.long_description && (
        <div
          className="text-muted-foreground mb-6 flex flex-col gap-4"
          style={{ lineHeight: 1.7, maxWidth: 680, fontSize: '0.9rem' }}
        >
          {selectedTag.long_description
            .split(/\n{2,}/)
            .map((para, i) => para.trim() && <p key={i}>{para.trim()}</p>)}
        </div>
      )}

      {/* Facts (Wikidata / Wolfram) — restrained key/value list */}
      {facts.length > 0 && (
        <dl
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-6 border-t pt-4"
          style={{ maxWidth: 680 }}
        >
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b py-1">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium text-right">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Learn more */}
      {selectedTag.wikipedia_url && (
        <a
          href={selectedTag.wikipedia_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-8 no-underline hover:text-primary"
        >
          {t('resources.tagDetail.readOnWikipedia', 'Read on Wikipedia')}
          <ExternalLink size={14} />
        </a>
      )}

      {/* Bridge into search — everything across the site tagged with this term. */}
      {selectedTag.slug && (
        <div className="mb-8">
          <Button
            variant="accent"
            onClick={() => onNavigate(`/search?tags=${encodeURIComponent(selectedTag.slug)}`)}
          >
            <Search size={16} />
            {t('resources.tagDetail.searchTagged', 'Search everything tagged {{name}}', {
              name: selectedTag.name,
            })}
          </Button>
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 min-w-0">
        <TagLinkedContent tagId={selectedTag.id} tagName={selectedTag.name} />
        <div className="flex flex-col gap-6 lg:sticky self-start" style={{ top: 80 }}>
          <RelatedTagsCard
            tagId={selectedTag.id}
            sourceCategory={primary?.name}
            onTagClick={(t) => onTagClick({ name: t.name, id: t.id } as CentralizedTag)}
          />

          <Collapsible open={graphOpen} onOpenChange={setGraphOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary">
              <Network size={14} />
              {t('resources.tagDetail.viewAsGraph', 'View as graph')}
              <ChevronDown
                size={14}
                className="transition-transform"
                style={{ transform: graphOpen ? 'rotate(180deg)' : undefined }}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-container border overflow-hidden mt-4" style={{ height: 420 }}>
                {graphOpen && (
                  <Suspense fallback={<PageLoadingState count={1} />}>
                    <TagRelationshipGraph
                      categoryFilter={primary?.id ?? null}
                      onTagClick={(tag) =>
                        onTagClick({ name: tag.name, id: tag.id } as CentralizedTag)
                      }
                    />
                  </Suspense>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
    </TagDetailWithGate>
  );
}
