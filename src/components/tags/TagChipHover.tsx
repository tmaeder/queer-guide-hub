import { useTranslation } from 'react-i18next';
import { HoverCardContent } from '@/components/ui/hover-card';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { useTagPreview } from '@/hooks/useTagPreviews';
import { TagDefinitionCard } from './TagDefinitionCard';
import { normalizeTagName } from '@/utils/tagNormalization';

/**
 * Hover-card body for a tag chip. Mounted only while the card is open, so the
 * preview fetch is lazy by construction. A slug with no glossary row (free-text
 * tag) degrades to the bare entry link — never an error state.
 */
export function TagChipHoverContent({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { affirmed } = useAgeAffirmation();
  const { data: preview, isLoading } = useTagPreview(slug);

  return (
    <HoverCardContent align="start" className="w-72">
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : preview ? (
        <TagDefinitionCard preview={preview} affirmed={affirmed} compact />
      ) : (
        <div className="space-y-1">
          <p className="text-15 font-bold">{normalizeTagName(slug.replace(/[-_]+/g, ' '))}</p>
          <LocalizedLink
            to={`/tags/${encodeURIComponent(slug.toLowerCase())}`}
            className="inline-block text-13 font-medium underline underline-offset-4"
          >
            {t('tags.preview.open', 'Read the entry')}
          </LocalizedLink>
        </div>
      )}
    </HoverCardContent>
  );
}
