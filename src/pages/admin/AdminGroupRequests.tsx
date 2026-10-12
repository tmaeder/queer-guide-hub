import { ContentEntityTabs } from '@/components/admin/ContentEntityTabs';
import { PendingJoinRequestsPanel } from '@/components/admin/groups/PendingJoinRequestsPanel';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

/**
 * Membership approval within the Groups workspace. Shares the same navigation
 * as the group list; the route retains its moderator access requirement.
 */
export default function AdminGroupRequests() {
  return (
    <div>
      <ContentEntityTabs type="community_groups" />
      <AdminArchetypeHeader title="Groups" />
      <p className="mb-4 text-sm text-muted-foreground">
        Approve or reject pending requests to join a community group.
      </p>
      <PendingJoinRequestsPanel />
    </div>
  );
}
