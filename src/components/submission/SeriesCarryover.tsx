/**
 * SeriesCarryover — "Eventreihen" prompt. When the typed event title matches past editions
 * of a series, offers to clone last time's details into the form (everything except the new
 * occurrence's dates / edition label). Non-blocking.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History } from 'lucide-react';
import type { PreviousEdition } from '@/hooks/submission/useEventSeries';

interface SeriesCarryoverProps {
  editions: PreviousEdition[];
  onClone: (edition: PreviousEdition) => void;
}

function editionLabel(e: PreviousEdition): string {
  if (e.edition) return e.edition;
  if (e.start_date) return new Date(e.start_date).getFullYear().toString();
  return 'previous edition';
}

export function SeriesCarryover({ editions, onClone }: SeriesCarryoverProps) {
  if (editions.length === 0) return null;

  return (
    <Card role="status" aria-live="polite" className="mb-6">
      <CardContent>
        <div className="flex items-start gap-2 mb-4">
          <History size={18} className="shrink-0 mt-0.5 text-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">New edition of “{editions[0].title}”?</p>
            <p className="text-xs text-muted-foreground">
              We found earlier editions of this event. Reuse last time’s details — venue,
              description, links, pricing — and just set the new date. You’ll still review
              everything before submitting.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editions.map((e) => (
            <Button
              key={e.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onClone(e)}
              className="flex items-center gap-1.5"
            >
              <History size={14} aria-hidden="true" />
              Use {editionLabel(e)}
              {e.city ? ` · ${e.city}` : ''}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
