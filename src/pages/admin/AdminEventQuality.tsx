import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EventQualityPanel } from '@/components/admin/EventQualityPanel';
import { DedupPendingLink } from '@/components/admin/DedupPendingLink';
import { Table2 } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

/**
 * Event quality dashboard: field-coverage, city coverage gaps, and source
 * quality signals. Reached via the Quality tab on the events list. Full event
 * CRUD lives at /admin/content/events.
 */
export default function AdminEventQuality() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {/* mb-0: the parent already spaces children with gap-6. */}
      <AdminPageHeader
        className="mb-0"
        title="Event quality"
        subtitle="Field coverage, city coverage gaps, and source quality signals."
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
