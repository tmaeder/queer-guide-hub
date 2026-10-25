import { useState } from 'react';
import { isReadOnlyRedirectRole } from '@/lib/redirects/roles';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
interface AccessRequest {
  id: string;
  folder_id: string;
  folder_name: string;
  member_label: string;
  member_role: string;
  member_active: boolean;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  message: string;
  created_at: string;
  granted_permission: 'edit' | 'owner' | null;
}
export function AskRedirectEdit({
  folderId,
  folderName,
  userId,
  viewer,
  onClose,
}: {
  folderId: string;
  folderName: string;
  userId: string;
  viewer: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const send = useMutation({
    mutationFn: () => memberRedirectApi('/access-requests', 'POST', { folderId, message }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['redirect-access-requests', userId] }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !send.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask to edit {folderName}</DialogTitle>
          <DialogDescription>
            Folder owners will review your request. Approval can grant editor or owner access.
          </DialogDescription>
        </DialogHeader>
        {viewer && (
          <p className="text-sm">
            Your workspace role is read only. A workspace administrator must update that role before
            a folder owner can approve edit access.
          </p>
        )}
        {send.isSuccess ? (
          <div className="space-y-4">
            <p role="status">Request saved for review. Check Access requests for its status.</p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="access-request-message">Message (optional)</Label>
              <Textarea
                id="access-request-message"
                value={message}
                maxLength={1000}
                disabled={send.isPending}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            {send.isError && (
              <p role="alert" className="text-destructive">
                {send.error.message}
              </p>
            )}
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? 'Sending…' : 'Send edit request'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function RedirectAccessRequests({
  userId,
  initialView = 'mine',
  onChanged,
  onViewChange,
}: {
  userId: string;
  initialView?: 'mine' | 'review';
  onChanged: () => Promise<unknown>;
  onViewChange?: (view: 'mine' | 'review') => void;
}) {
  const client = useQueryClient();
  const [view, setView] = useState<'mine' | 'review'>(initialView);
  const [confirm, setConfirm] = useState<{
      id: string;
      action: 'approve' | 'deny' | 'cancel';
    } | null>(null),
    [permission, setPermission] = useState<'edit' | 'owner'>('edit');
  const query = useInfiniteQuery({
    queryKey: ['redirect-access-requests', userId, view],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      memberRedirectApi<{ data: AccessRequest[]; count: number; nextCursor: string | null }>(
        '/access-requests?' +
          new URLSearchParams({ view, limit: '50', ...(pageParam ? { cursor: pageParam } : {}) }),
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const change = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'deny' | 'cancel' }) =>
      memberRedirectApi(
        '/access-requests/' + id,
        action === 'cancel' ? 'DELETE' : 'PATCH',
        action === 'cancel'
          ? undefined
          : { action, ...(action === 'approve' ? { permission } : {}) },
      ),
    onSuccess: async () => {
      setConfirm(null);
      await client.invalidateQueries({ queryKey: ['redirect-access-requests', userId] });
      await onChanged();
    },
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <section aria-label="Access requests" className="space-y-4 rounded-container border p-4">
      <h2 className="text-title font-sans font-bold">Access requests</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={view === 'mine' ? 'default' : 'outline'}
          disabled={change.isPending}
          onClick={() => {
            change.reset();
            setView('mine');
            onViewChange?.('mine');
            setConfirm(null);
          }}
        >
          My requests
        </Button>
        <Button
          variant={view === 'review' ? 'default' : 'outline'}
          disabled={change.isPending}
          onClick={() => {
            change.reset();
            setView('review');
            onViewChange?.('review');
            setConfirm(null);
          }}
        >
          Requests to review
        </Button>
        <Button variant="ghost" onClick={() => void query.refetch()}>
          Refresh requests
        </Button>
      </div>
      {query.isPending && <p role="status">Loading requests…</p>}
      {query.isError && <p role="alert">{query.error.message}</p>}
      {change.isError && (
        <p role="alert" className="text-destructive">
          {change.error.message}
        </p>
      )}
      <ul className="divide-y">
        {rows.map((request) => (
          <li key={request.id} className="space-y-2 py-4">
            <h3 className="font-medium">{request.folder_name}</h3>
            <p className="text-sm">
              {view === 'review' ? request.member_label + ' · ' : ''}
              {request.status}
              {request.granted_permission ? ' · ' + request.granted_permission + ' access' : ''}
            </p>
            {request.message && (
              <p className="whitespace-pre-wrap break-words text-sm">{request.message}</p>
            )}
            {view === 'review' &&
              (isReadOnlyRedirectRole(request.member_role) || !request.member_active) && (
                <p className="text-sm text-muted-foreground">
                  A workspace administrator must activate or upgrade this membership before
                  approval.
                </p>
              )}
            {request.status === 'pending' &&
              (confirm?.id === request.id ? (
                <div className="space-y-2">
                  {confirm.action === 'approve' ? (
                    <>
                      <Label htmlFor={'grant-' + request.id}>Grant folder permission</Label>
                      <select
                        id={'grant-' + request.id}
                        className="block w-full max-w-full rounded-element border bg-background p-2"
                        value={permission}
                        onChange={(e) => setPermission(e.target.value as 'edit' | 'owner')}
                        disabled={change.isPending}
                      >
                        <option value="edit">Editor — edit folder links</option>
                        <option value="owner">Owner — edit links and manage access</option>
                      </select>
                      <p className="text-sm">
                        Grant this permission to {request.member_label} for this folder?
                      </p>
                    </>
                  ) : (
                    <p className="text-sm">
                      {confirm.action === 'deny' ? 'Deny this request?' : 'Withdraw this request?'}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={change.isPending} onClick={() => change.mutate(confirm)}>
                      {change.isPending
                        ? 'Saving…'
                        : confirm.action === 'approve'
                          ? 'Confirm approval'
                          : confirm.action === 'deny'
                            ? 'Confirm denial'
                            : 'Confirm withdrawal'}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={change.isPending}
                      onClick={() => setConfirm(null)}
                    >
                      Keep request unchanged
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {view === 'review' ? (
                    <>
                      <Button
                        variant="outline"
                        disabled={
                          change.isPending ||
                          isReadOnlyRedirectRole(request.member_role) ||
                          !request.member_active
                        }
                        onClick={() => {
                          setPermission('edit');
                          setConfirm({ id: request.id, action: 'approve' });
                        }}
                      >
                        Approve request
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={change.isPending}
                        onClick={() => setConfirm({ id: request.id, action: 'deny' })}
                      >
                        Deny request
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={change.isPending}
                      onClick={() => setConfirm({ id: request.id, action: 'cancel' })}
                    >
                      Withdraw request
                    </Button>
                  )}
                </div>
              ))}
          </li>
        ))}
      </ul>
      {query.isSuccess && !rows.length && (
        <p>
          {view === 'review'
            ? 'No pending requests for folders you own.'
            : 'You have no access requests.'}
        </p>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more requests
        </Button>
      )}
    </section>
  );
}
