import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EventQualityPanel } from '@/components/admin/EventQualityPanel';
import { DedupPendingLink } from '@/components/admin/DedupPendingLink';
import { Table2 } from 'lucide-react';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { EventQualityIssuesPanel } from '@/components/admin/EventQualityIssuesPanel';

/**
 * Event quality dashboard: field-coverage, city coverage gaps, and source
 * quality signals. Reached via the Quality tab on the events list. Full event
 * CRUD lives at /admin/content/events.
 */
export default function AdminEventQuality() {
  const [issueQuery, setIssueQuery] = useState('');
  const [issueQueueKey, setIssueQueueKey] = useState(0);
  const filterIssueQueue = (issueCode: string) => {
    setIssueQuery(issueCode);
    setIssueQueueKey((current) => current + 1);
    requestAnimationFrame(() =>
      document.getElementById('event-quality-issues')?.scrollIntoView({ behavior: 'smooth' }),
    );
  };

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
      <EventQualityPanel onIssueFilter={filterIssueQueue} />
      <EventQualityIssuesPanel
        key={issueQueueKey}
        query={issueQuery}
        onQueryChange={setIssueQuery}
      />
      <DedupPendingLink entityType="event" />
    </div>
  );
}
