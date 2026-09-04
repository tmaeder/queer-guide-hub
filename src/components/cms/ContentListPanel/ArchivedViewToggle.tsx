/**
 * Live / Archived / All for the content list.
 *
 * Renders only for a type that can express an archived state. Countries
 * declare a lifecycle with no `archive` block on purpose, and a toggle there
 * would offer a view that can never differ from the default.
 *
 * The middle option uses the type's OWN label — "Ghost" for cities and
 * villages, "Cancelled" for events, "Inactive" for listings — because those
 * words mean different things and flattening them all to "Archived" would
 * misdescribe the row. A ghost city is not an archived place, it is not a
 * place.
 */
import { Archive } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContentLifecycleConfig } from '@/types/cms';
import type { ArchivedView } from './filterOps';

interface ArchivedViewToggleProps {
  lifecycle: ContentLifecycleConfig | undefined;
  value: ArchivedView;
  onChange: (v: ArchivedView) => void;
}

export function ArchivedViewToggle({ lifecycle, value, onChange }: ArchivedViewToggleProps) {
  const archive = lifecycle?.archive;
  if (!archive) return null;
  const label = archive.label ?? 'Archived';

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ArchivedView)}>
      <SelectTrigger
        aria-label="Show live or archived rows"
        className="h-9 w-auto min-w-[130px] gap-1.5 text-sm"
      >
        <Archive size={14} className="shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* The middle option is the BARE label. Appending "only" reads fine for
            "Archived" and "Cancelled" but yields "Not a place only" for a ghost
            city — and that is the label most in need of being legible, since it
            is the one whose meaning is not obvious. "All" dodges the same
            problem on the third option ("Live + not a place"). */}
        <SelectItem value="live">Live only</SelectItem>
        <SelectItem value="archived">{label}</SelectItem>
        <SelectItem value="all">All</SelectItem>
      </SelectContent>
    </Select>
  );
}
