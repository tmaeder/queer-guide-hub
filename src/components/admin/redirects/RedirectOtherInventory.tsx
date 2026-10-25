import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RedirectQrDialog } from '@/components/admin/redirects/RedirectQrDialog';
import { concreteInventorySource } from './inventorySource';
import { validPublicTarget } from '../../../../supabase/functions/_shared/link-policy';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memberRedirectApi, type MemberResources } from '@/lib/redirects/memberApi';
import type { InventoryRedirect } from '@/lib/redirects/inventory';
import { Button } from '@/components/ui/button';
import { AdminInlineSpinner, AdminTableSkeleton } from '@/components/admin/primitives/AdminLoading';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
export interface OtherInventoryRow extends InventoryRedirect {
  rowId: string;
  folderId: string | null;
  comment: string;
  isArchived: boolean;
  metadataVersion: string | null;
  canEditMetadata: boolean;
  tagIds: string[];
  matchKind?: string;
}
type Metadata = Pick<
  OtherInventoryRow,
  'id' | 'folderId' | 'comment' | 'isArchived' | 'metadataVersion' | 'canEditMetadata' | 'tagIds'
>;
function MetadataDraft({
  value,
  resources,
  onSave,
  onReload,
}: {
  value: Metadata;
  resources: MemberResources;
  onSave: (values: Record<string, unknown>, version: string | null) => Promise<void>;
  onReload: () => void;
}) {
  const [comment, setComment] = useState(value.comment),
    [folder, setFolder] = useState(value.folderId ?? ''),
    [tags, setTags] = useState(value.tagIds),
    [archived, setArchived] = useState(value.isArchived);
  const [version] = useState(value.metadataVersion);
  const stale = version !== value.metadataVersion;
  const save = useMutation({
    retry: false,
    mutationFn: () =>
      onSave({ comment, folderId: folder || null, tagIds: tags, isArchived: archived }, version),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="source-comment">Workspace comment</Label>
        <Textarea
          id="source-comment"
          maxLength={10000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={!value.canEditMetadata}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="source-folder">Folder</Label>
        <select
          id="source-folder"
          className="w-full rounded-element border bg-background p-2"
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
          disabled={!value.canEditMetadata}
        >
          <option value="">Unfiled</option>
          {resources.folders
            .filter((item) => item.canEdit || item.id === value.folderId)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.canEdit ? '' : ' · view only'}
              </option>
            ))}
        </select>
      </div>
      <fieldset className="space-y-2" disabled={!value.canEditMetadata}>
        <legend className="font-medium">Tags</legend>
        {resources.tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={tags.includes(tag.id)}
              onChange={(event) =>
                setTags(
                  event.target.checked ? [...tags, tag.id] : tags.filter((id) => id !== tag.id),
                )
              }
            />
            {tag.name}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={archived}
          onChange={(event) => setArchived(event.target.checked)}
          disabled={!value.canEditMetadata}
        />
        Archive in workspace
      </label>
      <p className="text-sm text-muted-foreground">
        These settings organize the source record. Its routing and destination stay controlled by
        the original source.
      </p>
      {stale && <p role="status">The metadata changed. Reload before saving this draft.</p>}
      {save.isError && (
        <p role="alert" className="text-destructive">
          {save.error.message} Reload to review the current settings before trying again.
        </p>
      )}
      <div className="flex gap-2">
        {value.canEditMetadata && (
          <Button type="submit" disabled={save.isPending || save.isError || stale}>
            {save.isPending ? 'Saving…' : 'Save organization'}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={save.isPending} onClick={onReload}>
          Reload settings
        </Button>
      </div>
    </form>
  );
}
function Organization({
  row,
  userId,
  resources,
  readOnly,
  onClose,
}: {
  row: OtherInventoryRow;
  userId: string;
  resources: MemberResources;
  readOnly: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const query = useQuery({
    queryKey: ['redirect-member', userId, 'source-metadata', row.id],
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      memberRedirectApi<Metadata>(
        '/inventory/metadata?id=' + encodeURIComponent(row.id),
        'GET',
        undefined,
        signal,
      ),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Organize redirect</DialogTitle>
          <DialogDescription className="break-all">{row.source}</DialogDescription>
        </DialogHeader>
        {query.isPending && <p role="status">Loading source settings…</p>}
        {query.isError ? (
          <div>
            <p role="alert">{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          query.data && (
            <MetadataDraft
              key={epoch}
              value={{ ...query.data, canEditMetadata: !readOnly && query.data.canEditMetadata }}
              resources={resources}
              onReload={() =>
                void query.refetch().then((result) => {
                  if (alive.current && !result.isError) setEpoch((n) => n + 1);
                })
              }
              onSave={async (values, version) => {
                await memberRedirectApi('/inventory/organization', 'POST', [
                  { id: row.id, version, values },
                ]);
                if (!alive.current) return;
                await client.invalidateQueries({
                  queryKey: ['redirect-member', userId, 'other-inventory'],
                });
                if (alive.current) onClose();
              }}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
export function RedirectOtherInventory({
  userId,
  filters,
  resources,
  onPrefill,
  readOnly = false,
}: {
  userId: string;
  filters: Record<string, unknown>;
  resources: MemberResources;
  onPrefill?: (row: OtherInventoryRow, target: string) => void;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [bulkFolder, setBulkFolder] = useState(''),
    [bulkTag, setBulkTag] = useState('');
  const client = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [editing, setEditing] = useState<OtherInventoryRow | null>(null),
    [kind, setKind] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['redirect-member', userId, 'other-inventory', filters, kind],
    initialPageParam: null as string | null,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '50', excludeManaged: 'true' });
      for (const [key, value] of Object.entries({ ...filters, ...(kind ? { kind } : {}) })) {
        if (value !== undefined) params.set(key, value === null ? 'builtin' : String(value));
      }
      if (pageParam) params.set('after', pageParam);
      return memberRedirectApi<{
        data: OtherInventoryRow[];
        count: number;
        nextCursor: string | null;
      }>('/inventory?' + params, 'GET', undefined, signal);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = (query.isError ? [] : (query.data?.pages.flatMap((page) => page.data) ?? [])).map(
    (row) => ({
      ...row,
      canEditMetadata: !readOnly && row.canEditMetadata,
    }),
  );
  const selectedRows = [
    ...new Map(
      rows
        .filter((row) => row.canEditMetadata && selected.includes(row.id))
        .map((row) => [row.id, row]),
    ).values(),
  ];
  const bulk = useMutation({
    retry: false,
    mutationFn: (action: 'archive' | 'restore' | 'folder' | 'add-tag' | 'remove-tag') =>
      memberRedirectApi(
        '/inventory/organization',
        'POST',
        selectedRows.map((row) => ({
          id: row.id,
          version: row.metadataVersion,
          values:
            action === 'folder'
              ? { folderId: bulkFolder || null }
              : action === 'add-tag'
                ? { tagIds: [...new Set([...row.tagIds, bulkTag])] }
                : action === 'remove-tag'
                  ? { tagIds: row.tagIds.filter((id) => id !== bulkTag) }
                  : { isArchived: action === 'archive' },
        })),
      ),
    onSuccess: async () => {
      setSelected([]);
      await client.invalidateQueries({ queryKey: ['redirect-member', userId, 'other-inventory'] });
    },
    onError: () => client.invalidateQueries({ queryKey: ['redirect-member', userId] }),
  });
  const change = useMutation({
    retry: false,
    onError: () => client.invalidateQueries({ queryKey: ['redirect-member', userId] }),
    mutationFn: (row: OtherInventoryRow) =>
      memberRedirectApi('/inventory/organization', 'POST', [
        { id: row.id, version: row.metadataVersion, values: { isArchived: !row.isArchived } },
      ]),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['redirect-member', userId, 'other-inventory'] }),
  });
  return (
    <section aria-label="Other redirects" className="space-y-4 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-title font-sans font-bold">Other redirects</h2>
          <p className="text-sm text-muted-foreground">
            Path rules, automatic aliases and declarative routes you can access.
          </p>
        </div>
        <div>
          <Label htmlFor="source-kind">Source kind</Label>
          <select
            id="source-kind"
            value={kind}
            className="ml-2 rounded-element border bg-background p-2"
            onChange={(event) => {
              setKind(event.target.value);
              setEditing(null);
              setSelected([]);
              setQr(null);
              bulk.reset();
            }}
          >
            <option value="">All source kinds</option>
            {['Manual', 'Automatic', 'Static', 'Client'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>
      {query.isPending && <AdminTableSkeleton rows={4} columns={3} />}
      {query.isError && (
        <div>
          <p role="alert">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry sources
          </Button>
        </div>
      )}
      {change.isError && (
        <p role="alert" className="text-destructive">
          {change.error.message}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {query.isError ? 0 : (query.data?.pages[0]?.count ?? 0)} accessible records
        {rows.length ? ' · ' + rows.length + ' loaded' : ''}
      </p>
      {selectedRows.length > 0 && (
        <div
          className="space-y-4 rounded-element border p-4"
          aria-label="Selected source organization"
        >
          <p>{selectedRows.length} selected source records</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate('archive')}
            >
              Archive selected sources
            </Button>
            <Button
              variant="outline"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate('restore')}
            >
              Restore selected sources
            </Button>
            <Button variant="ghost" disabled={bulk.isPending} onClick={() => setSelected([])}>
              Clear source selection
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="bulk-source-folder">Move sources to</Label>
              <select
                id="bulk-source-folder"
                className="block rounded-element border bg-background p-2"
                value={bulkFolder}
                onChange={(event) => setBulkFolder(event.target.value)}
              >
                <option value="">Unfiled</option>
                {resources.folders
                  .filter((folder) => folder.canEdit)
                  .map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              variant="outline"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate('folder')}
            >
              Move selected sources
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="bulk-source-tag">Source tag</Label>
              <select
                id="bulk-source-tag"
                className="block rounded-element border bg-background p-2"
                value={bulkTag}
                onChange={(event) => setBulkTag(event.target.value)}
              >
                <option value="">Choose a tag</option>
                {resources.tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              disabled={bulk.isPending || !bulkTag}
              onClick={() => bulk.mutate('add-tag')}
            >
              Add tag to sources
            </Button>
            <Button
              variant="outline"
              disabled={bulk.isPending || !bulkTag}
              onClick={() => bulk.mutate('remove-tag')}
            >
              Remove tag from sources
            </Button>
          </div>
          {bulk.isError && (
            <p role="alert" className="text-destructive">
              {bulk.error.message} Reload the view and review the selection before retrying.
            </p>
          )}
        </div>
      )}
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.rowId} className="space-y-2 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={'Select source ' + row.source}
                  checked={selected.includes(row.id) && row.canEditMetadata}
                  disabled={
                    !row.canEditMetadata ||
                    bulk.isPending ||
                    (selectedRows.length >= 100 && !selected.includes(row.id))
                  }
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, row.id]
                        : selected.filter((id) => id !== row.id),
                    )
                  }
                />
                <span className="sr-only">Select source</span>
              </label>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-all font-medium">{row.source}</p>
                <p className="break-all text-sm">{row.target ?? 'Missing target'}</p>
                <p className="text-xs text-muted-foreground">
                  {row.kind} · {row.origin} · {row.state}
                  {row.isArchived ? ' · Archived' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {concreteInventorySource(row) && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(concreteInventorySource(row)!)
                          .then(() => toast.success('Source URL copied'))
                          .catch(() => toast.error('Could not copy source URL'))
                      }
                    >
                      Copy source URL
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQr(concreteInventorySource(row))}
                    >
                      QR
                    </Button>
                  </>
                )}
                {!readOnly &&
                  onPrefill &&
                  ((row.target &&
                    validPublicTarget(row.target) &&
                    !/(^|\/):[a-z_]/i.test(row.target) &&
                    !row.target.includes('*')) ||
                    concreteInventorySource(row)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onPrefill(
                          row,
                          row.target &&
                            validPublicTarget(row.target) &&
                            !/(^|\/):[a-z_]/i.test(row.target) &&
                            !row.target.includes('*')
                            ? row.target
                            : concreteInventorySource(row)!,
                        )
                      }
                    >
                      Create tracked link
                    </Button>
                  )}
                <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
                  {row.canEditMetadata ? 'Organize' : 'View organization'}
                </Button>
                {row.canEditMetadata && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={change.isPending}
                    onClick={() => change.mutate(row)}
                  >
                    {row.isArchived ? 'Restore' : 'Archive'}
                  </Button>
                )}
              </div>
            </div>
            {row.comment && (
              <p className="whitespace-pre-wrap break-words text-sm">{row.comment}</p>
            )}
          </li>
        ))}
      </ul>
      {!query.isPending && !query.isError && !rows.length && (
        <p>No other redirects match this view.</p>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? (
            <AdminInlineSpinner label="Fetching more sources" />
          ) : (
            'Load more sources'
          )}
        </Button>
      )}
      {qr && <RedirectQrDialog url={qr} onClose={() => setQr(null)} />}
      {editing && (
        <Organization
          key={userId + ':' + editing.id}
          row={editing}
          userId={userId}
          resources={resources}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
