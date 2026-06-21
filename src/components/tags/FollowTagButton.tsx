import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFollowedTags } from '@/hooks/useFollowedTags';
import { cn } from '@/lib/utils';

export interface FollowTagButtonProps {
  tagId: string;
  tagName?: string;
  tagSlug?: string | null;
  size?: 'sm' | 'default';
  className?: string;
}

/**
 * Follow/unfollow a tag. Monochrome `outline` (not the reserved brand accent);
 * fills in when following. Optimistic via {@link useFollowedTags}.
 */
export function FollowTagButton({
  tagId,
  tagName,
  tagSlug,
  size = 'sm',
  className,
}: FollowTagButtonProps) {
  const { isFollowing, toggleFollow } = useFollowedTags();
  const following = isFollowing(tagId);

  return (
    <Button
      type="button"
      variant={following ? 'default' : 'outline'}
      size={size}
      onClick={() => toggleFollow({ tagId, name: tagName, slug: tagSlug })}
      aria-pressed={following}
      className={cn('gap-1.5', className)}
    >
      {following ? <Check size={15} /> : <Plus size={15} />}
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}
