import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EventQualityPanel } from '@/components/admin/EventQualityPanel';
import { DedupPendingLink } from '@/components/admin/DedupPendingLink';
import { Table2 } from 'lucide-react';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

/**
 * Event quality dashboard: field-coverage, city coverage gaps, and source
 * quality signals. Reached via the Quality tab on the events list. Full event
 * CRUD lives at /admin/content/events.
 */
export default function AdminEventQuality() {
  return (
    <div className="flex flex-col gap-6">
      {/* mb-0: the parent already spaces children with gap-6. */}
      <AdminArchetypeHeader
        className="mb-0"
        title="Event quality"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/content/events">
              <Table2 size={14} className="mr-1" /> Edit events
            </Link>
          </Button>
        }
      />
      <EventQualityPanel />
      <DedupPendingLink entityType="event" />
    </div>
  );
}
