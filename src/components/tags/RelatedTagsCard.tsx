import { useSimilarTags } from '@/hooks/useTagRelationships';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface RelatedTagsCardProps {
  tagId: string;
  onTagClick: (tag: { name: string; id: string }) => void;
}

export function RelatedTagsCard({ tagId, onTagClick }: RelatedTagsCardProps) {
  const { data: similarTags, isLoading } = useSimilarTags(tagId, 10);

  if (isLoading) {
    return (
      <div>
        <h6 className="font-bold text-lg mb-4">Related</h6>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: 70 + i * 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!similarTags || similarTags.length === 0) return null;

  return (
    <div>
      <h6 className="font-bold text-lg mb-4">Related</h6>
      <div className="flex flex-wrap gap-2">
        {similarTags.map((tag) => (
          <Badge
            key={tag.tag_id}
            variant="outline"
            onClick={() => onTagClick({ name: tag.name, id: tag.tag_id })}
          >
            {tag.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
