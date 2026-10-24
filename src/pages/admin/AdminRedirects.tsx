import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { exportToCsv } from '@/utils/csvExport';
import { exportToExcel, type ExportColumnDef } from '@/utils/excelExport';
import { RedirectBulkActions } from '@/components/admin/redirects/RedirectBulkActions';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Plus, RefreshCw } from 'lucide-react';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { useAdminShell } from '@/components/admin/shell/AdminShell';
import { RedirectToolbarActions } from '@/components/admin/redirects/RedirectToolbarActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRedirectInventory } from '@/hooks/useRedirectInventory';
import {
  filterInventory,
  inventoryDomainFacets,
  canonicalInventoryDomain,
  type InventoryRedirect,
} from '@/lib/redirects/inventory';
import { publicSourceUrl } from '@/lib/redirects/linkTools';
import { RedirectLinkBuilder } from '@/components/admin/redirects/RedirectLinkBuilder';
import { RedirectQrDialog } from '@/components/admin/redirects/RedirectQrDialog';
import { RedirectTrackingDialog } from '@/components/admin/redirects/RedirectTrackingDialog';
import { RedirectWorkspaceDialog } from '@/components/admin/redirects/RedirectWorkspaceDialog';
import { RedirectOrganizationDialog } from '@/components/admin/redirects/RedirectOrganizationDialog';
import { RedirectAnalyticsDialog } from '@/components/admin/redirects/RedirectAnalyticsDialog';
import { RedirectConversionSetup } from '@/components/admin/redirects/RedirectConversionSetup';
import { RedirectPolicyDialog } from '@/components/admin/redirects/RedirectPolicyDialog';
import { useRedirectWorkspace } from '@/hooks/useRedirectWorkspace';
import { commentSegments, filterWorkspaceLinks } from '@/lib/redirects/workspace';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PAGE_SIZE = 50;
const SELECT_CLASS =
  'h-9 max-w-full rounded-element border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const exportColumns: ExportColumnDef<InventoryRedirect>[] = [
  { header: 'Source', accessor: (row) => row.source },
  { header: 'Destination', accessor: (row) => row.target },
  { header: 'HTTP status', accessor: (row) => row.statusCode },
  { header: 'State', accessor: (row) => row.state },
  { header: 'Origin', accessor: (row) => row.origin },
  { header: 'Kind', accessor: (row) => row.kind },
];
function exportRows(rows: InventoryRedirect[]) {
  exportToCsv(rows, exportColumns, 'queerguide-redirects.csv');
}

export default function AdminRedirects() {
  const inventory = useRedirectInventory();
  const workspace = useRedirectWorkspace();
  const { openEditor } = useAdminShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(0);
  const [linkSeed, setLinkSeed] = useState<{ row: InventoryRedirect | null } | null>(null);
  const [qrUrl, setQrUrl] = useState<{
    url: string;
    managedShortLink: boolean;
    linkId?: string;
  } | null>(null);
  const [tracking, setTracking] = useState<InventoryRedirect | null>(null);
  const [analyticsLink, setAnalyticsLink] = useState<string | undefined>();
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [organization, setOrganization] = useState<InventoryRedirect | null>(null);
  const [policyLink, setPolicyLink] = useState<InventoryRedirect | null>(null);
  const domainFilter = canonicalInventoryDomain(searchParams.get('domain') ?? '');
  const folderFilter = searchParams.get('folder') ?? '';
  const tagFilter = searchParams.get('tag') ?? '';
  const archiveFilter = ['active', 'archived', 'all'].includes(searchParams.get('archive') ?? '')
    ? (searchParams.get('archive') as 'active' | 'archived' | 'all')
    : 'active';
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectionScope = JSON.stringify([
    search,
    origin,
    state,
    domainFilter,
    folderFilter,
    tagFilter,
    archiveFilter,
  ]);
  const [selection, setSelection] = useState({ scope: selectionScope, ids: new Set<string>() });
  const selected = selection.scope === selectionScope ? selection.ids : new Set<string>();
  const clearSelection = () => setSelection({ scope: selectionScope, ids: new Set() });

  useEffect(() => {
    const id = searchParams.get('edit');
    if (!id) return;
    openEditor('redirects', id);
    setSearchParams(
      (params) => {
        params.delete('edit');
        return params;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams, openEditor]);

  const rows = inventory.data?.rows;
  const domains = useMemo(() => inventoryDomainFacets(rows ?? []), [rows]);
  const origins = useMemo(() => [...new Set(rows?.map((row) => row.origin) ?? [])].sort(), [rows]);
  const baseFiltered = useMemo(
    () =>
      filterInventory(rows ?? [], search, origin, state, domainFilter).sort((a, b) =>
        sort === 'source'
          ? a.source.localeCompare(b.source) || a.id.localeCompare(b.id)
          : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') ||
            a.source.localeCompare(b.source) ||
            a.id.localeCompare(b.id),
      ),
    [rows, search, origin, state, sort, domainFilter],
  );
  const filtered = useMemo(
    () =>
      workspace.data
        ? filterWorkspaceLinks(
            baseFiltered,
            workspace.data.metadata,
            folderFilter,
            tagFilter,
            archiveFilter,
          )
        : baseFiltered,
    [baseFiltered, workspace.data, folderFilter, tagFilter, archiveFilter],
  );
  const setOrganizationFilter = (key: 'folder' | 'tag' | 'archive' | 'domain', value: string) => {
    clearSelection();
    setPage(0);
    setSearchParams(
      (params) => {
        if (value) params.set(key, value);
        else params.delete(key);
        return params;
      },
      { replace: true },
    );
  };
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedRows = (rows ?? []).filter((row) => selected.has(row.id));
  const toggle = (ids: string[], checked: boolean) =>
    setSelection((current) => {
      const next = new Set(current.scope === selectionScope ? current.ids : []);
      for (const id of ids) {
        if (checked && next.size < 100) next.add(id);
        else if (!checked) next.delete(id);
      }
      return { scope: selectionScope, ids: next };
    });
  const partial = !!inventory.data?.errors.length;

  return (
    <div className="min-w-0">
      <AdminArchetypeHeader
        title={
          <>
            Redirects{' '}
            <span className="text-muted-foreground tabular-nums">
              {rows ? `${partial ? '≥ ' : ''}${rows.length.toLocaleString()}` : '…'}
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void inventory.refetch()}
              disabled={inventory.isFetching}
            >
              <RefreshCw size={14} aria-hidden className="mr-1" />
              Refresh
            </Button>
            <RedirectToolbarActions />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAnalyticsLink(undefined);
                setAnalyticsOpen(true);
              }}
            >
              Analytics
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConversionOpen(true)}>
              Conversion setup
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWorkspaceOpen(true)}>
              Folders, tags &amp; templates
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLinkSeed({ row: null })}>
              Create tracked link
            </Button>
            <Button size="sm" onClick={() => openEditor('redirects', null)}>
              <Plus size={14} aria-hidden className="mr-1" />
              New Redirect
            </Button>
          </>
        }
      />
      <p className="mb-4 text-13 text-muted-foreground">
        Manual links, automatic aliases, static rules, and client route redirects. Automatic and
        static rules are managed at their source.{' '}
        <Link to="/admin/content/redirects/manual" className="underline underline-offset-2">
          Manage manual rules
        </Link>
        .
      </p>
      <fieldset
        disabled={bulkBusy}
        className="mb-4 flex flex-wrap items-center gap-2"
        role="search"
        aria-label="Search redirects"
      >
        <Input
          className="min-w-0 flex-1 basis-64"
          aria-label="Search redirects"
          placeholder="Search source, destination, or origin"
          value={search}
          onChange={(event) => {
            clearSelection();
            setSearch(event.target.value);
            setPage(0);
          }}
        />
        <select
          className={SELECT_CLASS}
          aria-label="Redirect origin"
          value={origin}
          onChange={(event) => {
            clearSelection();
            setOrigin(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All origins</option>
          {origins.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Redirect state"
          value={state}
          onChange={(event) => {
            clearSelection();
            setState(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All states</option>
          {[
            'Enabled',
            'Disabled',
            'Scheduled',
            'Expired',
            'Limit reached',
            'Missing target',
            'Recorded',
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Sort redirects"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(0);
          }}
        >
          <option value="updated">Newest first</option>
          <option value="source">Source A–Z</option>
        </select>
        {(['Excel', 'CSV'] as const).map((format) => (
          <ExportExcelButton
            key={format}
            format={format}
            onExport={async () => {
              const result = await inventory.refetch();
              if (result.error || !result.data || result.data.errors.length) {
                throw new Error('Could not load every redirect source. Retry before exporting.');
              }
              if (format === 'CSV') exportRows(result.data.rows);
              else
                await exportToExcel(result.data.rows, exportColumns, 'queerguide-redirects.xlsx');
            }}
          />
        ))}
        <select
          className={SELECT_CLASS}
          aria-label="Filter by domain"
          value={domainFilter}
          onChange={(event) => setOrganizationFilter('domain', event.target.value)}
        >
          <option value="">All domains</option>
          {domainFilter && !domains.some((domain) => domain.hostname === domainFilter) && (
            <option value={domainFilter}>{domainFilter} (not in current inventory)</option>
          )}
          {domains.map((domain) => (
            <option key={domain.hostname} value={domain.hostname}>
              {domain.hostname} ({domain.count})
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by folder"
          value={folderFilter}
          disabled={!workspace.data}
          onChange={(event) => setOrganizationFilter('folder', event.target.value)}
        >
          <option value="">All folders</option>
          <option value="unfiled">Unfiled</option>
          {workspace.data?.folders.map((folder) => (
            <option value={folder.id} key={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by tag"
          value={tagFilter}
          disabled={!workspace.data}
          onChange={(event) => setOrganizationFilter('tag', event.target.value)}
        >
          <option value="">All tags</option>
          {workspace.data?.tags.map((tag) => (
            <option value={tag.id} key={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Archive status"
          value={archiveFilter}
          disabled={!workspace.data}
          onChange={(event) => setOrganizationFilter('archive', event.target.value)}
        >
          <option value="active">Active view</option>
          <option value="archived">Archived</option>
          <option value="all">All redirects</option>
        </select>
        {(domainFilter || folderFilter || tagFilter || archiveFilter !== 'active') && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(window.location.href)}
          >
            Copy filtered view
          </Button>
        )}
      </fieldset>
      {selectedRows.length > 0 && (
        <RedirectBulkActions
          rows={selectedRows}
          onBusy={setBulkBusy}
          onClear={clearSelection}
          onExport={() => exportRows(selectedRows)}
        />
      )}
      {workspace.isError && (
        <div role="alert" className="mb-4 text-sm text-destructive">
          Could not load folders, tags, and templates. Organization filters are unavailable.{' '}
          <Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>
            Retry workspace
          </Button>
        </div>
      )}
      {partial && (
        <div role="alert" className="mb-4 rounded-element border border-destructive p-4 text-13">
          <p className="font-medium">
            Some redirect sources could not be loaded. This list and its total are incomplete.
          </p>
          <ul className="mt-2 list-disc pl-4">
            {inventory.data!.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void inventory.refetch()}
            disabled={inventory.isFetching}
          >
            Retry failed sources
          </Button>
        </div>
      )}
      {inventory.isError && (
        <p role="alert" className="mb-4 text-destructive">
          Could not load redirects. {inventory.error.message}
        </p>
      )}
      {inventory.isPending ? (
        <p role="status" className="py-8 text-muted-foreground">
          Loading all redirect sources…
        </p>
      ) : (
        <>
          <Table variant="admin" aria-label="Redirects">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    aria-label="Select visible redirects"
                    disabled={bulkBusy || !workspace.data || !visible.length}
                    checked={visible.length > 0 && visible.every((row) => selected.has(row.id))}
                    onChange={(event) =>
                      toggle(
                        visible.map((row) => row.id),
                        event.target.checked,
                      )
                    }
                  />
                </TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={'Select ' + row.source}
                      checked={selected.has(row.id)}
                      disabled={
                        bulkBusy ||
                        !workspace.data ||
                        (!selected.has(row.id) && selected.size >= 100)
                      }
                      onChange={(event) => toggle([row.id], event.target.checked)}
                    />
                  </TableCell>
                  <TableCell className="min-w-48 max-w-80 break-words font-mono text-xs">
                    {row.source}
                  </TableCell>
                  <TableCell className="min-w-48 max-w-80 break-words font-mono text-xs">
                    {row.target ?? (
                      <span className="font-sans text-muted-foreground">
                        Destination unavailable
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.statusCode ?? (row.kind === 'Client' ? 'Client' : '—')}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.state}
                    {workspace.data?.metadata.get(row.id)?.is_archived && (
                      <span className="block text-xs text-muted-foreground">Archived</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="block whitespace-nowrap">{row.kind}</span>
                    <span className="text-xs text-muted-foreground">{row.origin}</span>
                  </TableCell>
                  <TableCell className="min-w-40 max-w-64">
                    <p className="text-xs text-muted-foreground">
                      {workspace.data?.folders.find(
                        (folder) => folder.id === workspace.data?.metadata.get(row.id)?.folder_id,
                      )?.name ?? 'Unfiled'}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {workspace.data?.tags
                        .filter((tag) =>
                          workspace.data?.metadata.get(row.id)?.tagIds.includes(tag.id),
                        )
                        .map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded-badge bg-muted px-2 py-0.5 text-xs"
                            title={`Tag color: ${tag.color}`}
                          >
                            <span
                              aria-hidden
                              className="redirect-tag-swatch mr-1 inline-block h-2 w-2 rounded-badge"
                              data-color={tag.color}
                            />
                            {tag.name}
                          </span>
                        ))}
                    </div>
                    {workspace.data?.metadata.get(row.id)?.comment && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs">
                        {commentSegments(workspace.data.metadata.get(row.id)!.comment).map(
                          (segment, index) =>
                            segment.url ? (
                              <a
                                className="underline underline-offset-2"
                                href={segment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                key={index}
                              >
                                {segment.text}
                              </a>
                            ) : (
                              <span key={index}>{segment.text}</span>
                            ),
                        )}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.manualId ? (
                      (row.clicks ?? 0).toLocaleString()
                    ) : (
                      <span className="text-xs text-muted-foreground">Not tracked</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Tools
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {row.manualId && row.isShortLink && (
                          <DropdownMenuItem onSelect={() => setPolicyLink(row)}>
                            Link settings
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          disabled={!workspace.data}
                          onSelect={() => setOrganization(row)}
                        >
                          Folder, tags &amp; comment
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setLinkSeed({ row })}>
                          Create tracked link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!publicSourceUrl(row.source, row.domainHostname)}
                          onSelect={() => {
                            const url = publicSourceUrl(row.source, row.domainHostname);
                            if (url)
                              setQrUrl({
                                url,
                                managedShortLink: !!row.isShortLink,
                                linkId: row.isShortLink ? row.manualId : undefined,
                              });
                          }}
                        >
                          QR code
                        </DropdownMenuItem>
                        {row.manualId ? (
                          <>
                            <DropdownMenuItem
                              onSelect={() => {
                                setAnalyticsLink(row.manualId);
                                setAnalyticsOpen(true);
                              }}
                            >
                              Detailed analytics
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setTracking(row)}>
                              Visit tracking
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => openEditor('redirects', row.manualId!)}
                            >
                              Edit redirect
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem disabled>Managed at source</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!visible.length && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                    {rows?.length
                      ? 'No redirects match these filters.'
                      : partial
                        ? 'No records loaded. Retry the failed sources above.'
                        : 'No redirects found.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p
              role="status"
              aria-live="polite"
              className="text-13 text-muted-foreground tabular-nums"
            >
              {filtered.length ? currentPage * PAGE_SIZE + 1 : 0}–
              {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length.toLocaleString()}
              {partial ? ' loaded redirects' : ' redirects'}
              {inventory.isFetching ? ' · Refreshing…' : ''}
            </p>
            <nav aria-label="Redirect pages" className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span className="text-13 tabular-nums">
                {currentPage + 1} / {lastPage + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= lastPage}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </nav>
          </div>
        </>
      )}
      {linkSeed && (
        <RedirectLinkBuilder
          seed={linkSeed.row}
          defaultFolderId={folderFilter === 'unfiled' ? '' : folderFilter}
          onClose={() => setLinkSeed(null)}
        />
      )}
      {qrUrl && (
        <RedirectQrDialog
          url={qrUrl.url}
          managedShortLink={qrUrl.managedShortLink}
          linkId={qrUrl.linkId}
          onClose={() => setQrUrl(null)}
        />
      )}
      {analyticsOpen && (
        <RedirectAnalyticsDialog
          links={rows ?? []}
          initialLink={analyticsLink}
          initialFolder={folderFilter || undefined}
          initialTag={tagFilter || undefined}
          onClose={() => setAnalyticsOpen(false)}
        />
      )}
      {tracking && <RedirectTrackingDialog row={tracking} onClose={() => setTracking(null)} />}
      {conversionOpen && (
        <RedirectConversionSetup links={rows ?? []} onClose={() => setConversionOpen(false)} />
      )}
      {workspaceOpen && <RedirectWorkspaceDialog onClose={() => setWorkspaceOpen(false)} />}
      {policyLink && <RedirectPolicyDialog row={policyLink} onClose={() => setPolicyLink(null)} />}
      {organization && (
        <RedirectOrganizationDialog
          key={organization.id}
          row={organization}
          onClose={() => setOrganization(null)}
        />
      )}
    </div>
  );
}
