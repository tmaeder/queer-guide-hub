import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Table2 } from 'lucide-react';
import { PendingJoinRequestsPanel } from '@/components/admin/groups/PendingJoinRequestsPanel';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

/**
 * Group join-request approval. Re-homed from the retired AdminGroups page;
 * reached via the "Requests" tab on the groups list. Full group CRUD lives at
 * /admin/content/community_groups.
 */
export default function AdminGroupRequests() {
  return (
    <div className="flex flex-col gap-6">
      {/* mb-0: the parent already spaces children with gap-6. */}
      <AdminArchetypeHeader
        className="mb-0"
        title="Group requests"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/content/community_groups">
              <Table2 size={14} className="mr-1" /> Edit groups
            </Link>
          </Button>
        }
      />
      <PendingJoinRequestsPanel />
    </div>
  );
}
