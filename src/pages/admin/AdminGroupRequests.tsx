import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Table2 } from 'lucide-react';
import { PendingJoinRequestsPanel } from '@/components/admin/groups/PendingJoinRequestsPanel';

/**
 * Group join-request approval. Re-homed from the retired AdminGroups page;
 * reached via the "Requests" tab on the groups list. Full group CRUD lives at
 * /admin/content/community_groups.
 */
export default function AdminGroupRequests() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline">Group requests</h1>
          <p className="text-13 text-muted-foreground">Approve or reject pending join requests.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/content/community_groups">
            <Table2 size={14} className="mr-1" /> Edit groups
          </Link>
        </Button>
      </div>
      <PendingJoinRequestsPanel />
    </div>
  );
}
