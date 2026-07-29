import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Table2 } from 'lucide-react';
import { PendingJoinRequestsPanel } from '@/components/admin/groups/PendingJoinRequestsPanel';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

/**
 * Group join-request approval. Re-homed from the retired AdminGroups page;
 * reached via the "Requests" tab on the groups list. Full group CRUD lives at
 * /admin/content/community_groups.
 */
export default function AdminGroupRequests() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {/* mb-0: the parent already spaces children with gap-6. */}
      <AdminPageHeader
        className="mb-0"
        title="Group requests"
        subtitle="Approve or reject pending join requests."
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
