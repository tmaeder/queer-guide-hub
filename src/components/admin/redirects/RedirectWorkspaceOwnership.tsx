import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { createWorkspaceRedirectApi } from '@/lib/redirects/memberApi';
import { LEGACY_REDIRECT_WORKSPACE } from '../../../../supabase/functions/_shared/redirect-workspace';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminInlineSpinner, AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import type {
  WorkspaceOwner as Owner,
  OwnerCandidate as Candidate,
  WorkspaceOwnershipPage as Page,
} from '../../../../sdk/redirects/typescript';
type Review = { kind: 'admit'; candidate: Candidate } | { kind: 'revoke'; owner: Owner };
export function RedirectWorkspaceOwnership({
  workspaceId = LEGACY_REDIRECT_WORKSPACE,
}: {
  workspaceId?: string;
}) {
  const { user } = useAuth();
  return user ? (
    <OwnershipRegistry
      key={user.id + ':' + workspaceId}
      userId={user.id}
      workspaceId={workspaceId}
    />
  ) : null;
}
function OwnershipRegistry({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const api = useMemo(() => createWorkspaceRedirectApi(workspaceId), [workspaceId]);
  const client = useQueryClient();
  const [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const key = ['redirect-workspace-ownership', userId, workspaceId];
  const owners = useInfiniteQuery({
    queryKey: [...key, 'owners'],
    gcTime: 0,
    retry: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<Page<Owner>>(
        '/workspace-ownership?' +
          new URLSearchParams({
            view: 'owners',
            limit: '50',
            ...(pageParam ? { after: pageParam } : {}),
          }),
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const header = owners.isError ? undefined : owners.data?.pages[0];
  const candidates = useInfiniteQuery({
    queryKey: [...key, 'candidates'],
    enabled: !!header && !header.legacy,
    gcTime: 0,
    retry: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<Page<Candidate>>(
        '/workspace-ownership?' +
          new URLSearchParams({
            view: 'candidates',
            limit: '50',
            ...(pageParam ? { after: pageParam } : {}),
          }),
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = header ? (owners.data?.pages.flatMap((page) => page.data) ?? []) : [];
  const available =
    candidates.isError || !header
      ? []
      : (candidates.data?.pages.flatMap((page) => page.data) ?? []);
  const apply = async () => {
    if (!review) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (review.kind === 'admit')
        await api('/workspace-ownership', 'POST', {
          memberId: review.candidate.memberId,
          expectedRole: review.candidate.role,
        });
      else
        await api('/workspace-ownership/' + review.owner.userId, 'DELETE', {
          version: review.owner.version,
        });
      setMessage(
        review.kind === 'admit'
          ? 'Workspace Owner access granted.'
          : 'Explicit Owner access removed. Any existing member role still applies.',
      );
      setReview(null);
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: ['redirect-workspace-members'] });
      await client.invalidateQueries({ queryKey: ['redirect-member', userId, 'session'] });
    } catch (cause) {
      setReview(null);
      setError(cause instanceof Error ? cause.message : 'Could not change Owner access.');
      await client.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Workspace Owners" className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">Workspace Owners</h3>
      {owners.isPending && <AdminTextSkeleton lines={3} />}
      {owners.isError && (
        <div role="alert">
          <p>Could not load current Owner access. {owners.error.message}</p>
          <Button variant="outline" onClick={() => void owners.refetch()}>
            Retry Owners
          </Button>
        </div>
      )}
      {owners.isRefetching && <AdminInlineSpinner />}
      {header && (
        <>
          <p className="text-sm">
            Owner access for <strong>{header.workspace.name}</strong> ({header.workspace.slug}).
            Owners manage all Redirects resources and access in this workspace.
          </p>
          {header.legacy ? (
            <p className="text-sm text-muted-foreground">
              This legacy workspace uses application administrators as Owners. Manage their app
              roles in{' '}
              <a className="underline" href="/admin/users">
                Users &amp; roles
              </a>
              .
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Owner grants are separate from member roles. At least one Owner must remain. Registry
              changes do not activate a provisioning workspace.
            </p>
          )}
          <ul className="space-y-4">
            {rows.map((owner) => (
              <li key={owner.userId} className="space-y-4 border-t py-4">
                <div>
                  <p className="font-medium">
                    {owner.label}
                    {owner.userId === userId ? ' (you)' : ''}
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {owner.userId}
                  </p>
                  {owner.grantedAt && (
                    <p className="text-sm text-muted-foreground">
                      Granted {formatDateTime(owner.grantedAt)}
                    </p>
                  )}
                </div>
                {!header.legacy && (
                  <Button
                    variant="outline"
                    disabled={busy || !owner.canRemove}
                    onClick={() => {
                      setReview({ kind: 'revoke', owner });
                      setError('');
                      setMessage('');
                    }}
                  >
                    Remove Owner access
                  </Button>
                )}
                {!header.legacy && !owner.canRemove && (
                  <p className="text-sm text-muted-foreground">The last Owner cannot be removed.</p>
                )}
              </li>
            ))}
          </ul>
          {owners.hasNextPage && (
            <Button
              variant="outline"
              disabled={owners.isFetchingNextPage}
              onClick={() => void owners.fetchNextPage()}
            >
              Load more Owners
            </Button>
          )}
          {!header.legacy && (
            <div className="space-y-4">
              <h4 className="font-medium">Admit another Owner</h4>
              <p className="text-sm text-muted-foreground">
                Choose a current, verified account member. Machine members cannot become Owners.
              </p>
              {candidates.isPending && <AdminTextSkeleton lines={2} />}
              {candidates.isError && (
                <div role="alert">
                  <p>Could not load eligible members. {candidates.error.message}</p>
                  <Button variant="outline" onClick={() => void candidates.refetch()}>
                    Retry members
                  </Button>
                </div>
              )}
              <ul className="space-y-4">
                {available.map((candidate) => (
                  <li
                    key={candidate.memberId}
                    className="flex flex-wrap items-start justify-between gap-4 border-t py-4"
                  >
                    <div>
                      <p className="font-medium">
                        {candidate.label} · {candidate.role}
                      </p>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {candidate.userId}
                      </p>
                      {!candidate.verified && (
                        <p className="text-sm text-muted-foreground">
                          Verify this account’s email before Owner admission.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy || !candidate.verified}
                      onClick={() => {
                        setReview({ kind: 'admit', candidate });
                        setError('');
                        setMessage('');
                      }}
                    >
                      Review Owner access
                    </Button>
                  </li>
                ))}
              </ul>
              {!candidates.isPending && !candidates.isError && !available.length && (
                <AdminEmpty noun="members available for Owner admission" variant="inline" />
              )}
              {candidates.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={candidates.isFetchingNextPage}
                  onClick={() => void candidates.fetchNextPage()}
                >
                  Load more members
                </Button>
              )}
            </div>
          )}
          {review && !header.legacy && (
            <div role="group" aria-label="Review Owner change" className="space-y-4 border-t pt-4">
              <p className="font-medium">
                {review.kind === 'admit'
                  ? 'Grant Owner access to ' +
                    review.candidate.label +
                    ' in ' +
                    header.workspace.name +
                    '?'
                  : 'Remove Owner access from ' +
                    review.owner.label +
                    ' in ' +
                    header.workspace.name +
                    '?'}
              </p>
              <p className="break-all font-mono text-xs">
                {review.kind === 'admit' ? review.candidate.userId : review.owner.userId}
              </p>
              <p className="text-sm">
                {review.kind === 'admit'
                  ? 'This grants control of all Redirects resources, settings and access in this workspace. It does not grant application administrator access.'
                  : review.owner.memberRole
                    ? 'This account returns to its existing ' +
                      review.owner.memberRole +
                      ' membership.'
                    : 'This account loses workspace access unless another membership is granted.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={review.kind === 'revoke' ? 'destructive' : 'default'}
                  disabled={busy}
                  onClick={() => void apply()}
                >
                  {busy
                    ? 'Saving…'
                    : review.kind === 'admit'
                      ? 'Confirm Owner access'
                      : 'Confirm Owner removal'}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setReview(null)}>
                  Cancel Owner change
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
