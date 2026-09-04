/**
 * Unmerged / Merged / Both for the content list.
 *
 * The list hides soft-merged rows by default, and this is what keeps them
 * REACHABLE. A merged row is the entry point for reviewing or undoing a bad
 * merge — `unmerge_cities` and its eleven siblings need the row to exist and
 * need a human to be able to find it — so the predicate is a default, never a
 * permanent hide.
 *
 * Renders only for a type whose table records a soft merge. Tags, guides,
 * pages, redirects and the vocabularies have no such column, and offering a
 * view there would be worse than useless: the predicate behind it answers
 * PostgREST 400 and the list renders empty.
 *
 * `/admin/duplicates` deliberately does NOT go through this path — it runs its
 * own queries via `useVenueDuplicates` (`find_duplicate_clusters`,
 * `mergeEntityPair`, `unmergeEntity`) and must always see merged rows. A future
 * refactor routing that page through the CMS list would hide exactly the rows
 * it exists to show.
 */
import { GitMerge } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MergeCapability } from '@/types/cms';
import type { MergedView } from './filterOps';

interface MergedViewToggleProps {
  merge: MergeCapability | undefined;
  value: MergedView;
  onChange: (v: MergedView) => void;
}

export function MergedViewToggle({ merge, value, onChange }: MergedViewToggleProps) {
  if (!merge) return null;
  const label = merge.label ?? 'Merged';

  return (
    <Select value={value} onValueChange={(v) => onChange(v as MergedView)}>
      <SelectTrigger
        aria-label="Show unmerged or merged rows"
        className="h-9 w-auto min-w-[130px] gap-1.5 text-sm"
      >
        <GitMerge size={14} className="shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unmerged">Unmerged only</SelectItem>
        <SelectItem value="merged">{label} only</SelectItem>
        <SelectItem value="all">Unmerged + {label.toLowerCase()}</SelectItem>
      </SelectContent>
    </Select>
  );
}
