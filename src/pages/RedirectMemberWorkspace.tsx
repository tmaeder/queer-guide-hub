import { RedirectIntegrationInstallations } from '@/components/admin/redirects/RedirectIntegrationInstallations';
import { RedirectInvitationAcceptance } from '@/components/admin/redirects/RedirectInvitations';
import { RedirectMemberTags } from '@/components/admin/redirects/RedirectMemberTags';
import { RedirectWorkspaceInformation } from '@/components/admin/redirects/RedirectWorkspaceInformation';
import { isReadOnlyRedirectRole, type RedirectWorkspaceRole } from '@/lib/redirects/roles';
import { RedirectOtherInventory } from '@/components/admin/redirects/RedirectOtherInventory';
import {
  AskRedirectEdit,
  RedirectAccessRequests,
} from '@/components/admin/redirects/RedirectAccessRequests';
import { PageContainer } from '@/components/layout/PageContainer';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RedirectDomainSelect } from '@/components/admin/redirects/RedirectDomainSelect';
import { useRedirectDomainChoices } from '@/hooks/useRedirectDomainChoices';
import { useAuth } from '@/hooks/useAuth';
import { useLinkedRedirectDomains } from '@/hooks/useLinkedRedirectDomains';
import { UUID } from '../../supabase/functions/_shared/redirect-api';
import { useMemberRedirectResources } from '@/hooks/useMemberRedirectResources';
import {
  memberRedirectApi,
  type MemberLink,
  type MemberResources,
} from '@/lib/redirects/memberApi';
import { managedLinksCsv } from '@/lib/redirects/importCsv';
import { CAMPAIGN_FIELDS } from '@/lib/redirects/linkTools';
import { manualRedirect, type InventoryRedirect } from '@/lib/redirects/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RedirectQrDialog } from '@/components/admin/redirects/RedirectQrDialog';
import { RedirectPolicyDialog } from '@/components/admin/redirects/RedirectPolicyDialog';
import { RedirectManagedImportDialog } from '@/components/admin/redirects/RedirectManagedImportDialog';
import { MemberRedirectAnalyticsDialog } from '@/components/admin/redirects/RedirectAnalyticsDialog';
import { RedirectFolderAccess } from '@/components/admin/redirects/RedirectFolderAccess';
const CONTROL = 'w-full rounded-element border bg-background p-2 text-sm';
function linkSource(link: MemberLink) {
  return link.domainId ? link.shortUrl : '/go/' + link.slug;
}
function inventory(link: MemberLink): InventoryRedirect {
  return manualRedirect({
    id: link.id,
    type: 'SHORT',
    slug: link.slug,
    is_domain_root: link.isDomainRoot ?? false,
    domain_id: link.domainId,
    domain_hostname: link.domainHostname,
    target: link.target,
    status_code: link.statusCode,
    is_enabled: link.isEnabled,
    start_at: link.startsAt,
    end_at: link.expiresAt,
    click_count: link.clicks,
    click_limit: link.clickLimit,
    utm_defaults: link.utmDefaults,
    query_mode: link.queryMode,
    query_override: link.queryOverride,
    updated_at: link.updatedAt,
  });
}
function exportLinks(links: MemberLink[]) {
  const url = URL.createObjectURL(
    new Blob([managedLinksCsv(links as unknown as Record<string, unknown>[])], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'redirect-links.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function LinkEditor({
  userId,
  link,
  prefill,
  resources,
  onSave,
  onClose,
}: {
  userId: string;
  link?: MemberLink;
  prefill?: MemberLink;
  resources: MemberResources;
  onSave: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const domain = useRedirectDomainChoices(
    userId,
    link ? { id: link.domainId ?? null, hostname: link.domainHostname ?? null } : undefined,
  );
  const initial = link ?? prefill;
  const [isDomainRoot, setIsDomainRoot] = useState(link?.isDomainRoot ?? false);
  const [slug, setSlug] = useState(link?.slug ?? ''),
    [target, setTarget] = useState(initial?.target ?? ''),
    [folderId, setFolderId] = useState(
      initial?.folderId && resources.folders.some((f) => f.id === initial.folderId && f.canEdit)
        ? initial.folderId
        : '',
    ),
    [comment, setComment] = useState(initial?.comment ?? '');
  const [tags, setTags] = useState(initial?.tagIds ?? []),
    [utm, setUtm] = useState(initial?.utmDefaults ?? {}),
    [enabled, setEnabled] = useState(initial?.isEnabled ?? true);
  const [queryMode, setQueryMode] = useState(link?.queryMode ?? 'PRESERVE');
  const save = useMutation({
    mutationFn: () =>
      onSave({
        ...(slug ? { slug } : {}),
        target,
        domainId: domain.domainId,
        isDomainRoot,
        folderId: folderId || null,
        comment,
        tagIds: tags,
        utmDefaults: utm,
        isEnabled: enabled,
        queryMode,
      }),
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {link ? 'Edit link' : prefill ? 'Create from this link' : 'Create link'}
          </DialogTitle>
          <DialogDescription>
            Choose a destination, organize the link and apply campaign defaults.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (domain.valid && (!isDomainRoot || domain.domainId)) save.mutate();
          }}
        >
          <fieldset disabled={save.isPending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-link-target">Destination</Label>
              <Input
                id="member-link-target"
                required
                maxLength={8192}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://example.com/register"
              />
            </div>
            <RedirectDomainSelect
              selection={domain}
              slug={slug}
              isDomainRoot={isDomainRoot}
              disabled={save.isPending}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDomainRoot}
                onChange={(e) => setIsDomainRoot(e.target.checked)}
              />
              Use domain homepage
            </label>
            {isDomainRoot && !domain.domainId && (
              <p role="alert">Choose a custom domain for its homepage link.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="member-link-slug">Short path</Label>
                <Input
                  id="member-link-slug"
                  disabled={isDomainRoot}
                  required={!!link && !isDomainRoot}
                  maxLength={64}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {link
                    ? 'Use 3–64 lowercase letters, numbers or hyphens.'
                    : 'Leave empty for a random path.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-link-folder">Folder</Label>
                <select
                  id="member-link-folder"
                  className={CONTROL}
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                >
                  <option value="">Unfiled</option>
                  {resources.folders
                    .filter((f) => f.canEdit)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-link-query">Destination query parameters</Label>
              <select
                id="member-link-query"
                className={CONTROL}
                value={queryMode}
                onChange={(e) => setQueryMode(e.target.value)}
              >
                <option value="PRESERVE">Preserve incoming parameters</option>
                <option value="DROP">Drop incoming parameters</option>
                {link?.queryMode === 'OVERRIDE' && (
                  <option value="OVERRIDE">Keep existing overrides</option>
                )}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-utm-template">Prefill campaign template</Label>
              <select
                id="member-utm-template"
                className={CONTROL}
                defaultValue=""
                onChange={(e) => {
                  const template = resources.templates.find((t) => t.id === e.target.value);
                  if (template) setUtm({ ...template.parameters });
                }}
              >
                <option value="">Choose a template</option>
                {resources.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {CAMPAIGN_FIELDS.map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={'member-' + field}>{field}</Label>
                  <Input
                    id={'member-' + field}
                    maxLength={2000}
                    value={utm[field] ?? ''}
                    onChange={(e) =>
                      setUtm((current) => {
                        const next = { ...current };
                        if (e.target.value) next[field] = e.target.value;
                        else delete next[field];
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Tags</legend>
              <div className="flex flex-wrap gap-4">
                {resources.tags.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tags.includes(tag.id)}
                      onChange={(e) =>
                        setTags(
                          e.target.checked ? [...tags, tag.id] : tags.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="member-link-comment">Team comment</Label>
              <Textarea
                id="member-link-comment"
                maxLength={10000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Link enabled
            </label>
          </fieldset>
          {save.isError && (
            <p role="alert" className="text-destructive">
              {save.error.message}
            </p>
          )}
          <Button
            type="submit"
            disabled={save.isPending || !domain.valid || (isDomainRoot && !domain.domainId)}
          >
            {save.isPending ? 'Saving…' : link ? 'Save link' : 'Create link'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function MemberWorkspaceContent({
  userId,
  initialRequestView,
}: {
  userId: string;
  initialRequestView?: 'mine' | 'review';
}) {
  const client = useQueryClient();
  const [manageTags, setManageTags] = useState(false);
  const [workspaceInformation, setWorkspaceInformation] = useState(false);
  const resources = useMemberRedirectResources(userId);
  const session = useQuery({
    queryKey: ['redirect-member', userId, 'session'],
    queryFn: () =>
      memberRedirectApi<{ role: RedirectWorkspaceRole; label: string | null }>('/session'),
    retry: false,
  });
  const [viewParams, setViewParams] = useSearchParams();
  const search = viewParams.get('q') ?? '',
    folder = viewParams.get('folder') ?? '',
    archive = viewParams.get('archive') === '1';
  const domainFilter = (viewParams.get('domain') ?? '').toLowerCase();
  const validDomainFilter = !domainFilter || domainFilter === 'builtin' || UUID.test(domainFilter);
  const setViewParam = (key: string, value: string) =>
    setViewParams(
      (params) => {
        if (value) params.set(key, value);
        else params.delete(key);
        return params;
      },
      { replace: true },
    );
  const setSearch = (value: string) => setViewParam('q', value),
    setFolder = (value: string) => setViewParam('folder', value),
    setArchive = (value: boolean) => setViewParam('archive', value ? '1' : '');
  const domains = useLinkedRedirectDomains(userId, session.isSuccess);
  const domainOptions = domains.isError ? [] : (domains.data?.data ?? []);
  const [selectedState, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ link?: MemberLink; prefill?: MemberLink } | null>(null),
    [qr, setQr] = useState<{ url: string; id: string } | null>(null),
    [policy, setPolicy] = useState<MemberLink | null>(null),
    [analytics, setAnalytics] = useState<string | null>(null),
    [importing, setImporting] = useState(false),
    [accessState, setAccess] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState(false);
  const [requestFolder, setRequestFolder] = useState<{ id: string; name: string } | null>(null);
  const [requestView, setRequestView] = useState<'mine' | 'review' | null>(
    initialRequestView ?? null,
  );
  const [deletingFolderState, setDeletingFolder] = useState(false);
  const [bulkFolder, setBulkFolder] = useState('');
  const [folderName, setFolderName] = useState(''),
    [deletingState, setDeleting] = useState<string[] | null>(null);
  const filters = {
    search,
    isArchived: archive,
    ...(folder ? { folderId: folder } : {}),
    ...(domainFilter ? { domainId: domainFilter === 'builtin' ? null : domainFilter } : {}),
  };
  const filterScope = JSON.stringify([userId, filters]);
  const [transientScope, setTransientScope] = useState(filterScope);
  const currentScope = transientScope === filterScope;
  const selected = currentScope ? selectedState : [],
    deleting = currentScope ? deletingState : null,
    access = currentScope ? accessState : null,
    deletingFolder = currentScope && deletingFolderState;
  useEffect(() => {
    if (transientScope === filterScope) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize transient selections/dialogs with externally navigated filter URLs; derived scope gates hide them before this effect runs.
    setSelected([]);
    setDeleting(null);
    setDeletingFolder(false);
    setAccess(null);
    setTransientScope(filterScope);
  }, [filterScope, transientScope]);
  const links = useInfiniteQuery({
    queryKey: ['redirect-member', userId, 'links', filters],
    enabled: session.isSuccess && validDomainFilter,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      memberRedirectApi<{ data: MemberLink[]; count: number; nextCursor: string | null }>(
        '/links?' +
          new URLSearchParams({
            filters: JSON.stringify(filters),
            limit: '50',
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const canWrite = session.data?.role === 'member' || session.data?.role === 'owner';
  const rows = (links.data?.pages.flatMap((p) => p.data) ?? []).map((link) => ({
    ...link,
    canEdit: canWrite && link.canEdit,
  }));
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['redirect-member', userId] });
    setSelected([]);
  };
  const mutate = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: 'POST' | 'PATCH' | 'DELETE';
      body?: Record<string, unknown>;
    }) => memberRedirectApi(path, method, body),
    onSuccess: refresh,
  });
  const bulk = async (action: 'archive' | 'restore' | 'delete', ids = selected) => {
    await mutate.mutateAsync({
      path: '/links/bulk',
      method: 'POST',
      body: {
        operations: ids.map((id) =>
          action === 'delete'
            ? { operation: 'delete', id }
            : { operation: 'update', id, data: { isArchived: action === 'archive' } },
        ),
      },
    });
    setDeleting(null);
  };
  const filterChange = (fn: () => void) => {
    setSelected([]);
    setDeleting(null);
    setDeletingFolder(false);
    setAccess(null);
    fn();
  };
  const selectedRows = rows.filter((r) => selected.includes(r.id));
  const allEditable =
    selected.length > 0 &&
    selectedRows.length === selected.length &&
    selectedRows.every((r) => r.canEdit);
  if (session.isPending) return <p role="status">Checking workspace access…</p>;
  if (session.isError)
    return (
      <section className="space-y-4">
        <h1 className="text-title font-sans font-bold">Link workspace access</h1>
        <p role="alert">{session.error.message}</p>
        <p>An administrator can add your existing account to this workspace.</p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Retry access
        </Button>
      </section>
    );
  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-headline font-normal">Link workspace</h1>
          <p className="text-muted-foreground">
            Your shared links, campaign settings, QR codes and analytics.{' '}
            {isReadOnlyRedirectRole(session.data?.role)
              ? 'You have read-only workspace access.'
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRequestView(requestView ? null : 'mine')}>
            {requestView ? 'Hide access requests' : 'Access requests'}
          </Button>
          <Button disabled={!canWrite || !resources.data} onClick={() => setEditor({})}>
            Create link
          </Button>
          <Button variant="outline" onClick={() => setAnalytics('')}>
            Analytics
          </Button>
          <Button variant="outline" disabled={!canWrite} onClick={() => setImporting(true)}>
            Import CSV
          </Button>
          {canWrite && (
            <Button
              variant="outline"
              disabled={!resources.data || resources.isError}
              onClick={() => setManageTags(true)}
            >
              Manage tags
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() => exportLinks(selected.length ? selectedRows : rows)}
          >
            {selected.length ? 'Export selected' : 'Export loaded links'}
          </Button>
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh workspace
          </Button>
          <Button variant="outline" onClick={() => setWorkspaceInformation(true)}>
            Workspace information
          </Button>
          <Button variant="outline" onClick={() => setIntegrations(true)}>
            Conversion adapters
          </Button>
        </div>
      </header>
      {requestView && (
        <RedirectAccessRequests
          key={requestView}
          userId={userId}
          initialView={requestView}
          onViewChange={setRequestView}
          onChanged={refresh}
        />
      )}
      {integrations && session.data && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setIntegrations(false);
          }}
        >
          <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Conversion adapters</DialogTitle>
              <DialogDescription>
                Server credentials and native provider setup for your shared links.
              </DialogDescription>
            </DialogHeader>
            <RedirectIntegrationInstallations
              key={userId + ':' + session.data.role}
              userId={userId}
              workspaceRole={session.data.role}
            />
          </DialogContent>
        </Dialog>
      )}
      {workspaceInformation && (
        <RedirectWorkspaceInformation
          key={userId}
          userId={userId}
          onClose={() => setWorkspaceInformation(false)}
        />
      )}
      {manageTags && canWrite && resources.data && !resources.isError && (
        <RedirectMemberTags
          key={userId}
          tags={resources.data.tags}
          onChanged={refresh}
          onClose={() => setManageTags(false)}
        />
      )}
      {requestFolder && (
        <AskRedirectEdit
          folderId={requestFolder.id}
          folderName={requestFolder.name}
          userId={userId}
          viewer={isReadOnlyRedirectRole(session.data?.role)}
          onClose={() => {
            setRequestFolder(null);
            setRequestView('mine');
          }}
        />
      )}
      {resources.isError && (
        <p role="alert">
          {resources.error.message}{' '}
          <Button variant="outline" onClick={() => void resources.refetch()}>
            Retry folders and templates
          </Button>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="workspace-search">Search links</Label>
          <Input
            id="workspace-search"
            value={search}
            maxLength={200}
            onChange={(e) => filterChange(() => setSearch(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace-folder">Folder filter</Label>
          <select
            id="workspace-folder"
            className={CONTROL}
            value={folder}
            onChange={(e) => filterChange(() => setFolder(e.target.value))}
          >
            <option value="">All accessible folders</option>
            {resources.data?.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {canWrite && f.canEdit ? '' : ' · view only'}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace-domain">Domain filter</Label>
          <select
            id="workspace-domain"
            className={CONTROL}
            value={domainFilter}
            onChange={(event) => filterChange(() => setViewParam('domain', event.target.value))}
          >
            <option value="">All accessible domains</option>
            <option value="builtin">queer.guide/go</option>
            {domainFilter &&
              domainFilter !== 'builtin' &&
              !domainOptions.some((domain) => domain.id === domainFilter) && (
                <option value={domainFilter}>Selected domain (not in accessible list)</option>
              )}
            {domainOptions.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.hostname}
              </option>
            ))}
          </select>
          {domains.isPending && (
            <p role="status" className="text-sm">
              Loading domain filters…
            </p>
          )}
          {domains.isError && (
            <div>
              <p role="alert" className="text-sm">
                Could not load domain filters.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void domains.refetch()}
              >
                Retry domain filters
              </Button>
            </div>
          )}
          {!validDomainFilter && (
            <p role="alert" className="text-sm">
              Invalid domain filter. Choose a domain or all accessible domains.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {(search || folder || archive || domainFilter) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(window.location.href)}
          >
            Copy filtered view
          </Button>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={archive}
            onChange={(e) => filterChange(() => setArchive(e.target.checked))}
          />
          Show archived links
        </label>
        {canWrite && folder && resources.data?.folders.find((f) => f.id === folder)?.canManage && (
          <Button variant="outline" size="sm" onClick={() => setAccess(folder)}>
            Manage folder access
          </Button>
        )}
      </div>
      {folder && resources.data?.folders.find((f) => f.id === folder && !f.canEdit) && (
        <Button
          variant="outline"
          onClick={() => {
            const current = resources.data!.folders.find((f) => f.id === folder)!;
            setRequestFolder({ id: current.id, name: current.name });
          }}
        >
          Ask to edit folder
        </Button>
      )}
      {canWrite && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate
              .mutateAsync({ path: '/folders', method: 'POST', body: { name: folderName } })
              .then(() => setFolderName(''))
              .catch(() => {});
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-member-folder">New folder</Label>
            <Input
              id="new-member-folder"
              value={folderName}
              required
              maxLength={100}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={mutate.isPending || !folderName.trim()}>
            Create folder
          </Button>
        </form>
      )}
      {canWrite && access && (
        <RedirectFolderAccess
          key={access}
          folderId={access}
          principalId={userId}
          onClose={() => {
            setAccess(null);
            void refresh();
          }}
        />
      )}
      {canWrite &&
        folder &&
        resources.data?.folders.some((f) => f.id === folder && (f.canRename ?? f.canManage)) && (
          <section className="space-y-2" aria-label="Folder management">
            <form
              key={folder}
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get('name') ?? '');
                void mutate
                  .mutateAsync({ path: '/folders/' + folder, method: 'PATCH', body: { name } })
                  .catch(() => {});
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="rename-member-folder">Folder name</Label>
                <Input
                  id="rename-member-folder"
                  name="name"
                  defaultValue={resources.data.folders.find((f) => f.id === folder)?.name}
                  maxLength={100}
                  required
                />
              </div>
              <Button type="submit" variant="outline" disabled={mutate.isPending}>
                Rename folder
              </Button>
              {resources.data?.folders.find((f) => f.id === folder)?.canManage && (
                <Button type="button" variant="ghost" onClick={() => setDeletingFolder(true)}>
                  Delete folder
                </Button>
              )}
            </form>
            {deletingFolder && (
              <div className="space-y-2">
                <p>
                  {session.data?.role === 'owner'
                    ? 'Delete this folder and move its links to Unfiled?'
                    : 'Delete this folder? Move all its links out first.'}
                </p>
                <Button
                  variant="destructive"
                  disabled={mutate.isPending}
                  onClick={() =>
                    void mutate
                      .mutateAsync({ path: '/folders/' + folder, method: 'DELETE' })
                      .then(() => {
                        setFolder('');
                        setDeletingFolder(false);
                      })
                      .catch(() => {})
                  }
                >
                  Confirm folder deletion
                </Button>
                <Button variant="ghost" onClick={() => setDeletingFolder(false)}>
                  Cancel folder deletion
                </Button>
              </div>
            )}
          </section>
        )}
      {mutate.isError && (
        <p role="alert" className="text-destructive">
          {mutate.error.message}
        </p>
      )}
      {selected.length > 0 && (
        <section
          aria-label="Selected links"
          className="flex flex-wrap items-center gap-2 border-y py-4"
        >
          <span>{selected.length} selected</span>
          <Label htmlFor="selected-folder">Move selected links</Label>
          <select
            id="selected-folder"
            className="rounded-element border bg-background p-2 text-sm"
            value={bulkFolder}
            onChange={(e) => setBulkFolder(e.target.value)}
          >
            <option value="">Unfiled</option>
            {resources.data?.folders
              .filter((f) => f.canEdit)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!allEditable || mutate.isPending}
            onClick={() =>
              void mutate
                .mutateAsync({
                  path: '/links/bulk',
                  method: 'POST',
                  body: {
                    operations: selected.map((id) => ({
                      operation: 'update',
                      id,
                      data: { folderId: bulkFolder || null },
                    })),
                  },
                })
                .catch(() => {})
            }
          >
            Move selected
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={!allEditable || mutate.isPending}
            onClick={() => void bulk(archive ? 'restore' : 'archive').catch(() => {})}
          >
            {archive ? 'Restore selected' : 'Archive selected'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!allEditable || mutate.isPending}
            onClick={() => setDeleting([...selected])}
          >
            Delete selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </section>
      )}
      {deleting && (
        <section aria-label="Confirm deletion" className="space-y-2 rounded-container border p-4">
          <p>Permanently delete {deleting.length} link(s) and their tracking history?</p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={mutate.isPending}
              onClick={() => void bulk('delete', deleting).catch(() => {})}
            >
              Confirm permanent deletion
            </Button>
            <Button variant="outline" disabled={mutate.isPending} onClick={() => setDeleting(null)}>
              Cancel deletion
            </Button>
          </div>
        </section>
      )}
      {links.isPending && validDomainFilter && <p role="status">Loading links…</p>}
      {links.isError && (
        <p role="alert">
          {links.error.message}{' '}
          <Button variant="outline" onClick={() => void links.refetch()}>
            Retry links
          </Button>
        </p>
      )}
      {links.data && (
        <p className="text-sm text-muted-foreground">
          {rows.length} loaded of {links.data.pages[0].count} accessible links
        </p>
      )}
      <ul className="divide-y">
        {rows.map((link) => (
          <li key={link.id} className="space-y-4 py-4">
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                aria-label={'Select ' + linkSource(link)}
                className="mt-2"
                checked={selected.includes(link.id)}
                disabled={!selected.includes(link.id) && selected.length >= 100}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, link.id]
                      : selected.filter((id) => id !== link.id),
                  )
                }
              />
              <div className="min-w-0 flex-1">
                <a
                  className="break-all font-semibold underline"
                  href={link.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {linkSource(link)}
                </a>
                <p className="break-all text-sm">{link.target}</p>
                <p className="text-xs text-muted-foreground">
                  {link.clicks} clicks · {link.canEdit ? 'Can edit' : 'View only'} ·{' '}
                  {inventory(link).state}
                  {link.isArchived ? ' · Archived' : ''}
                </p>
                {link.comment && (
                  <p className="whitespace-pre-wrap break-words text-sm">{link.comment}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!link.canEdit || !resources.data}
                onClick={() => setEditor({ link })}
              >
                Edit {linkSource(link)}
              </Button>
              {!link.canEdit && link.folderId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRequestFolder({
                      id: link.folderId!,
                      name:
                        resources.data?.folders.find((f) => f.id === link.folderId)?.name ??
                        'folder',
                    })
                  }
                >
                  Ask to edit
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setPolicy(link)}>
                Link behavior
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQr({ url: link.shortUrl, id: link.id })}
              >
                QR code
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAnalytics(link.id)}>
                Link analytics
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canWrite || !resources.data}
                onClick={() => setEditor({ prefill: link })}
              >
                Create from link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!link.canEdit || mutate.isPending}
                onClick={() =>
                  void mutate
                    .mutateAsync({
                      path: '/links/' + link.id,
                      method: 'PATCH',
                      body: { isArchived: !link.isArchived },
                    })
                    .catch(() => {})
                }
              >
                {link.isArchived ? 'Restore' : 'Archive'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {links.isSuccess && !rows.length && <p>No accessible links match these filters.</p>}
      {links.hasNextPage && (
        <Button
          variant="outline"
          disabled={links.isFetchingNextPage}
          onClick={() => void links.fetchNextPage()}
        >
          {links.isFetchingNextPage ? 'Loading…' : 'Load more links'}
        </Button>
      )}
      {canWrite && editor && resources.data && (
        <LinkEditor
          userId={userId}
          key={editor.link?.id ?? editor.prefill?.id ?? 'new'}
          {...editor}
          resources={resources.data}
          onClose={() => setEditor(null)}
          onSave={async (body) => {
            const result = await mutate.mutateAsync({
              path: '/links' + (editor.link ? '/' + editor.link.id : ''),
              method: editor.link ? 'PATCH' : 'POST',
              body,
            });
            return result;
          }}
        />
      )}
      {resources.data && session.isSuccess && validDomainFilter && (
        <RedirectOtherInventory
          key={filterScope}
          userId={userId}
          filters={filters}
          resources={resources.data}
          readOnly={!canWrite}
          onPrefill={
            canWrite
              ? (row, target) =>
                  setEditor({
                    prefill: {
                      id: row.manualId ?? '',
                      slug: '',
                      shortUrl: row.source,
                      target,
                      folderId: row.folderId,
                      tagIds: row.tagIds,
                      comment: row.comment,
                      isEnabled: true,
                      isArchived: false,
                      clicks: 0,
                      canEdit: true,
                      statusCode: 302,
                      queryMode: 'PRESERVE',
                      queryOverride: null,
                      utmDefaults: row.campaign ?? null,
                      expiresAt: null,
                      startsAt: null,
                      clickLimit: null,
                      updatedAt: row.updatedAt ?? '',
                    },
                  })
              : undefined
          }
        />
      )}
      {qr && (
        <RedirectQrDialog
          url={qr.url}
          linkId={qr.id}
          managedShortLink
          onClose={() => setQr(null)}
        />
      )}{' '}
      {policy && (
        <RedirectPolicyDialog
          row={inventory(policy)}
          principalId={userId}
          readOnly={!canWrite || !policy.canEdit}
          onClose={() => setPolicy(null)}
        />
      )}
      {analytics !== null && (
        <MemberRedirectAnalyticsDialog
          links={rows.map(inventory)}
          initialLink={analytics || undefined}
          initialFolder={analytics ? undefined : folder || undefined}
          principalId={userId}
          onClose={() => setAnalytics(null)}
        />
      )}
      {canWrite && importing && <RedirectManagedImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
export default function RedirectMemberWorkspace() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Loading account…</p>;
  if (!user || user.is_anonymous)
    return (
      <Navigate
        to={'/auth?redirect=' + encodeURIComponent(location.pathname + location.search)}
        replace
      />
    );
  return (
    <PageContainer>
      <RedirectInvitationAcceptance key={user.id} userId={user.id} />
      <MemberWorkspaceContent
        key={user.id}
        userId={user.id}
        initialRequestView={
          new URLSearchParams(location.search).get('accessRequests') === 'review'
            ? 'review'
            : new URLSearchParams(location.search).get('accessRequests') === 'mine'
              ? 'mine'
              : undefined
        }
      />
    </PageContainer>
  );
}
