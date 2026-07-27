import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown, Link2 } from 'lucide-react';
import { useTagOntology, type OntologyTag } from '@/hooks/useTagRelationships';
import { TagChip } from '@/components/tags/TagChip';
import { Skeleton } from '@/components/ui/skeleton';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { isAdultCategoryName } from '@/components/resources/categoryMeta';

interface TagHierarchyCardProps {
  tagId: string;
}

function TagSection({
  icon,
  label,
  tags,
}: {
  icon: React.ReactNode;
  label: string;
  tags: OntologyTag[];
}) {
  if (tags.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-muted-foreground mb-2">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tg) => (
          <TagChip key={tg.id} tag={tg.slug || tg.name} name={tg.name} />
        ))}
      </div>
    </div>
  );
}

/**
 * Public surface of the governed ontology graph on a tag page: broader parents,
 * narrower children, and curated related concepts (from tag_relations), each
 * navigable. Empty sections and an all-empty card render nothing.
 */
export function TagHierarchyCard({ tagId }: TagHierarchyCardProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useTagOntology(tagId);
  const { enabled: safeEnabled } = useSafeMode();

  const filtered = useMemo(() => {
    const strip = (tags: OntologyTag[]) =>
      safeEnabled ? tags.filter((tg) => !isAdultCategoryName(tg.category)) : tags;
    return {
      broader: strip(data?.broader ?? []),
      narrower: strip(data?.narrower ?? []),
      related: strip(data?.related ?? []),
    };
  }, [data, safeEnabled]);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          {t('resources.tagDetail.hierarchy', 'In the taxonomy')}
        </h2>
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 rounded-element" />
          ))}
        </div>
      </div>
    );
  }

  const { broader, narrower, related } = filtered;
  if (broader.length === 0 && narrower.length === 0 && related.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">
        {t('resources.tagDetail.hierarchy', 'In the taxonomy')}
      </h2>
      <div className="flex flex-col gap-4">
        <TagSection
          icon={<ChevronUp size={12} />}
          label={t('resources.tagDetail.broader', 'Broader')}
          tags={broader}
        />
        <TagSection
          icon={<ChevronDown size={12} />}
          label={t('resources.tagDetail.narrower', 'More specific')}
          tags={narrower}
        />
        <TagSection
          icon={<Link2 size={12} />}
          label={t('resources.tagDetail.related', 'Related')}
          tags={related}
        />
      </div>
    </div>
  );
}
