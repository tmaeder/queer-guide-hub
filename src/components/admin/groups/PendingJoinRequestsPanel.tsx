/**
 * PendingJoinRequestsPanel — approve/reject pending community-group join
 * requests. Re-homed from the retired AdminGroups page; reached via the
 * "Requests" tab on the groups list.
 */

import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { useGroupJoinRequests } from '@/hooks/useGroupJoinRequests';

export function PendingJoinRequestsPanel() {
  const { requests, isLoading, approve, isApproving, reject, isRejecting } = useGroupJoinRequests();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!requests.length) {
    return <p className="text-sm text-muted-foreground">No pending join requests.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">Pending Join Requests ({requests.length})</h3>
      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div key={req.id} className="flex items-center justify-between gap-4 py-2 border-b border-border">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{req.group_name ?? req.group_id}</p>
              <p className="text-xs text-muted-foreground">
                User {req.user_id.slice(0, 8)}…{req.message ? ` — ${req.message}` : ''} ·{' '}
                {new Date(req.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => approve(req.id)} disabled={isApproving || isRejecting}>
                <Check size={14} className="mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reject(req.id)}
                disabled={isApproving || isRejecting}
              >
                <X size={14} className="mr-1" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
