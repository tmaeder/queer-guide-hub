import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EventQualityPanel } from '@/components/admin/EventQualityPanel';
import { Table2 } from 'lucide-react';

/**
 * Event quality dashboard: field-coverage, city coverage gaps, and source
 * quality signals. Reached via the Quality tab on the events list. Full event
 * CRUD lives at /admin/content/events.
 */
export default function AdminEventQuality() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">Event quality</h1>
          <p className="text-13 text-muted-foreground">
            Field coverage, city coverage gaps, and source quality signals.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/content/events">
            <Table2 size={14} className="mr-1" /> Edit events
          </Link>
        </Button>
      </div>
      <EventQualityPanel />
    </div>
  );
}
