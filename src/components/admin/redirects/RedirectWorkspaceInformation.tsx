import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type {
  WorkspaceInformationKind,
  WorkspaceInformationPage,
} from '../../../../sdk/redirects/typescript';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminInlineSpinner, AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const KINDS: Record<WorkspaceInformationKind, string> = {
  domains: 'Domains',
  tokens: 'API keys',
  webhooks: 'Webhooks',
};
const STATUS = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  archived: 'Archived',
  disabled: 'Disabled',
  ready: 'Routing ready',
  setup_required: 'Setup required',
  unavailable: 'Access changed',
};

export function RedirectWorkspaceInformation({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<WorkspaceInformationKind>('domains');
  const query = useInfiniteQuery({
    queryKey: ['redirect-member', userId, 'workspace-information', kind],
    initialPageParam: null as string | null,
    gcTime: 0,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      memberRedirectApi<WorkspaceInformationPage>(
        '/workspace-information?' +
          new URLSearchParams({ kind, limit: '50', ...(pageParam ? { after: pageParam } : {}) }),
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.isError ? [] : (query.data?.pages.flatMap((page) => page.data) ?? []);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Workspace information</DialogTitle>
          <DialogDescription>
            Shared configuration information. Owners manage domains, API keys and webhooks.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Information type">
          {(Object.keys(KINDS) as WorkspaceInformationKind[]).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={kind === value ? 'default' : 'outline'}
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {KINDS[value]}
            </Button>
          ))}
        </div>
        {query.isPending && <AdminTextSkeleton lines={4} />}
        {query.isError && (
          <div className="space-y-2">
            <p role="alert">{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry information
            </Button>
          </div>
        )}
        {query.isSuccess && (
          <>
            <p className="text-sm text-muted-foreground">
              Showing {rows.length} of {query.data.pages[0].count} {KINDS[kind].toLowerCase()}
            </p>
            {!rows.length && <AdminEmpty noun={KINDS[kind].toLowerCase()} variant="inline" />}
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all font-medium">{row.name}</span>
                    <Badge variant="outline">{STATUS[row.status]}</Badge>
                  </div>
                  {row.prefix !== undefined && (
                    <p className="text-sm">
                      Key prefix: <code>{row.prefix}…</code>
                    </p>
                  )}
                  {row.scopes && (
                    <p className="break-words text-sm">
                      Configured permissions: {row.scopes.join(', ')}
                    </p>
                  )}
                  {kind === 'tokens' && (
                    <p className="text-sm">
                      Link access: {row.linkCount === null ? 'All links' : row.linkCount + ' links'}
                      {row.memberBound ? ' · Bound to a workspace member' : ''}
                    </p>
                  )}
                  {row.expiresAt && (
                    <p className="text-sm">Expires {formatDateTime(row.expiresAt)}</p>
                  )}
                  {kind === 'tokens' && (
                    <p className="text-sm">
                      Last used: {row.lastUsedAt ? formatDateTime(row.lastUsedAt) : 'Never used'}
                    </p>
                  )}
                  {row.receiverHost && (
                    <p className="break-all text-sm">Receiver host: {row.receiverHost}</p>
                  )}
                  {row.eventTypes && (
                    <p className="break-words text-sm">Events: {row.eventTypes.join(', ')}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {formatDateTime(row.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            {query.hasNextPage && (
              <Button
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? (
                  <AdminInlineSpinner label="Loading more information" />
                ) : (
                  'Load more information'
                )}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
