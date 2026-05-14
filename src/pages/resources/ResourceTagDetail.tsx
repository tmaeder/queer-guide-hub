import React from 'react';
import { type CentralizedTag } from '@/hooks/useCentralizedTags';
import { RelatedTagsCard } from '@/components/tags/RelatedTagsCard';
import { TagLinkedContent } from '@/components/tags/TagLinkedContent';
import {
  getCategoryShortName,
} from '@/components/resources/categoryMeta';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { TagDetailWithGate } from '@/components/age-gate/TagDetailWithGate';
import { ArrowLeft, ChevronRight } from 'lucide-react';

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
  const safeMode = useSafeMode();
  const ageAffirmation = useAgeAffirmation();

  const primary =
    selectedTag.categories?.find((c) => c.is_primary) ?? selectedTag.categories?.[0];
  const parentName = primary?.parent_name ?? undefined;
  const childName = primary?.level === 1 ? primary.name : undefined;
  const tagCategoryNames = [
    ...(selectedTag.categories?.map((c) => c.name) ?? []),
    ...(selectedTag.categories?.map((c) => c.parent_name ?? null) ?? []),
  ];
  const isAdult = tagCategoryNames.some((n) => safeMode.isAdultCategory(n));

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
          <ArrowLeft style={{ width: 14, height: 14 }} />
          <span className="text-sm">Resources</span>
        </button>
        {parentName && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
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
            <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
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
        <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
        <span className="text-sm font-medium">{selectedTag.name}</span>
      </div>

      {/* Hero — only show image box when tag has an image */}
      {selectedTag.image_url ? (
        <div
          className="w-full rounded-2xl overflow-hidden mb-6 relative bg-muted"
          style={{ aspectRatio: '16 / 9' }}
        >
          <img
            src={selectedTag.image_url}
            alt={selectedTag.name}
            className="w-full h-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div
            className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)' }}
          >
            {primary && (
              <p className="font-semibold mb-1 uppercase text-white/65" style={{ fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                {parentName ? `${getCategoryShortName(parentName)} › ` : ''}
                {getCategoryShortName(primary.name)}
              </p>
            )}
            <h1 className="text-2xl font-extrabold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)', lineHeight: 1.1 }}>
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

      {selectedTag.description ? (
        <p className="text-muted-foreground mb-6" style={{ lineHeight: 1.7, maxWidth: 680, fontSize: '0.9rem' }}>
          {selectedTag.description}
        </p>
      ) : (
        <p className="text-muted-foreground mb-6 italic" style={{ fontSize: '0.85rem', opacity: 0.6 }}>
          No definition yet for this term.
        </p>
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
        </div>
      </div>
    </div>
    </TagDetailWithGate>
  );
}
