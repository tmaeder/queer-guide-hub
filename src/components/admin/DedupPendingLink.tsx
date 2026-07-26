import { Link } from 'react-router';
import { GitMerge } from 'lucide-react';
import { useDedupPendingCount } from '@/hooks/useDedupReview';

/**
 * Small cross-link rendered on each Truth Engine quality panel: shows how many
 * duplicate-merge suggestions the nightly dedup sweep queued for this entity
 * type and deep-links into the inbox dedup queue. Renders nothing when the
 * queue is empty.
 */
export function DedupPendingLink({ entityType }: { entityType: string }) {
  const { data: count } = useDedupPendingCount(entityType);
  if (!count) return null;
  return (
    <Link
      to="/admin/inbox?queue=dedup-review"
      className="flex items-center gap-2 rounded-element border p-2 text-13 hover:bg-muted/40"
    >
      <GitMerge size={14} />
      <span>
        {count} duplicate {count === 1 ? 'suggestion' : 'suggestions'} pending review
      </span>
    </Link>
  );
}
