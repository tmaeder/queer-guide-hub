/**
 * SEOPanel - SEO metadata editing panel for the CMS editor sidebar.
 * Provides fields for meta_title, meta_description, and canonical_url.
 * Includes character counts and a Google SERP preview.
 */

import React, { useCallback, useMemo } from 'react';
import { Globe, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CMSContentMetadata } from '@/types/cms';
import { cn } from '@/lib/utils';

interface SEOPanelProps {
  metadata: CMSContentMetadata | null;
  onUpdate: (updates: Partial<CMSContentMetadata>) => Promise<void>;
}

const META_TITLE_MAX = 60;
const META_DESCRIPTION_MAX = 160;

export function SEOPanel({ metadata, onUpdate }: SEOPanelProps) {
  const metaTitle = metadata?.meta_title ?? '';
  const metaDescription = metadata?.meta_description ?? '';
  const canonicalUrl = metadata?.canonical_url ?? '';

  const handleMetaTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ meta_title: e.target.value });
    },
    [onUpdate],
  );

  const handleMetaDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ meta_description: e.target.value });
    },
    [onUpdate],
  );

  const handleCanonicalUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ canonical_url: e.target.value });
    },
    [onUpdate],
  );

  // Character count styling
  const titleOver = metaTitle.length > META_TITLE_MAX;
  const descOver = metaDescription.length > META_DESCRIPTION_MAX;

  // Google preview values
  const previewTitle = metaTitle || 'Page Title';
  const previewUrl = canonicalUrl || 'https://queer.guide/...';
  const previewDescription =
    metaDescription ||
    'Add a meta description to see a preview of how this page will appear in search results.';

  // Truncate for preview
  const truncatedTitle = useMemo(
    () => (previewTitle.length > 60 ? previewTitle.slice(0, 57) + '...' : previewTitle),
    [previewTitle],
  );
  const truncatedDescription = useMemo(
    () =>
      previewDescription.length > 160
        ? previewDescription.slice(0, 157) + '...'
        : previewDescription,
    [previewDescription],
  );

  const isDisabled = !metadata;

  return (
    <div className="flex flex-col gap-4">
      {/* Meta Title */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground">Meta Title</span>
          <span
            className={cn(
              'text-[0.7rem]',
              titleOver ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {metaTitle.length}/{META_TITLE_MAX}
          </span>
        </div>
        <Input
          value={metaTitle}
          onChange={handleMetaTitleChange}
          placeholder="Enter SEO title..."
          disabled={isDisabled}
          maxLength={70}
          className="text-sm"
        />
      </div>

      {/* Meta Description */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground">Meta Description</span>
          <span
            className={cn(
              'text-[0.7rem]',
              descOver ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {metaDescription.length}/{META_DESCRIPTION_MAX}
          </span>
        </div>
        <Textarea
          value={metaDescription}
          onChange={handleMetaDescriptionChange}
          placeholder="Enter SEO description..."
          disabled={isDisabled}
          maxLength={200}
          rows={3}
          className="text-sm"
        />
      </div>

      {/* Canonical URL */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Globe style={{ width: 12, height: 12 }} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Canonical URL</span>
        </div>
        <Input
          value={canonicalUrl}
          onChange={handleCanonicalUrlChange}
          placeholder="https://queer.guide/..."
          disabled={isDisabled}
          type="url"
          className="text-sm"
        />
      </div>

      <hr className="border-border" />

      {/* Google SERP Preview */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Search style={{ width: 14, height: 14 }} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Google Preview</span>
        </div>
        <div className={cn('rounded-element border border-gray-200 p-3 bg-white')}>
          {/* Title line */}
          <p
            className="text-base font-medium leading-snug overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'Arial, sans-serif' }}
          >
            {truncatedTitle}
          </p>

          {/* URL line */}
          <span
            className="block mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[0.8rem]"
            style={{ color: 'hsl(var(--foreground))', fontFamily: 'Arial, sans-serif' }}
          >
            {previewUrl}
          </span>

          {/* Description */}
          <span
            className="mt-1 overflow-hidden text-[0.8rem] leading-snug"
            style={{
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'Arial, sans-serif',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {truncatedDescription}
          </span>
        </div>

        {!metadata && (
          <p className="text-xs text-muted-foreground mt-2 block">
            Save the item first to edit SEO metadata.
          </p>
        )}
      </div>
    </div>
  );
}
