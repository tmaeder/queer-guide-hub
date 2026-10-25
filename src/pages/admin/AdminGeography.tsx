import { useAdminShell } from '@/components/admin/shell/AdminShell';
import { GeographyLandmarks } from '@/components/admin/GeographyLandmarks';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  Home,
  MapPin,
  Move,
  Pencil,
  Plus,
  ExternalLink,
  Lock,
  X,
} from '@/components/icons';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminInlineSpinner } from '@/components/admin/primitives/AdminLoading';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CMSEditorLayout } from '@/components/cms/editor/CMSEditorLayout';
import { useGeoIntegrityViolations } from '@/hooks/useGeoPlaces';
import { useToast } from '@/hooks/use-toast';
import {
  geographyLabels,
  verificationLabels,
  useGeographyRows,
  useGeographyRecord,
  useGeographyFilters,
  useMoveGeography,
  useVerifyGeography,
  type GeographyFilters,
  type GeographyRecord,
  type GeographyType,
} from '@/hooks/useGeographyCMS';
import { cmsEditPath, livePath } from '@/lib/cmsLinks';
import { codeToFlagEmoji } from '@/lib/countryFlag';

const ICONS = { country: Globe, city: MapPin, village: Home };
const EMPTY_FILTERS: GeographyFilters = { search: '', type: null, continent: null, region: null };
const ROW_COLUMNS =
  'grid min-w-0 flex-1 grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_6rem_9rem]';
const TABLES = { country: 'countries', city: 'cities', village: 'queer_villages' };

function GeographyRows({
  parentId,
  filters,
  depth = 0,
  selectedId,
  expanded,
  onExpand,
  onSelect,
}: {
  parentId: string | null;
  filters: GeographyFilters;
  depth?: number;
  selectedId: string | null;
  expanded: Set<string>;
  onExpand: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const query = useGeographyRows(parentId, filters);
  if (query.isLoading) return <AdminTextSkeleton lines={3} />;
  if (query.isError)
    return (
      <div role="alert" className="p-4 text-13">
        Could not load geography: {query.error.message}{' '}
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];
  const global = !!filters.search || !!filters.type || !!filters.status;
  return (
    <div>
      {depth === 0 && rows.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-13 text-muted-foreground">
          <span className="w-11 shrink-0" aria-hidden />
          <div className={ROW_COLUMNS}>
            <span>
              Place{' '}
              <span className="ml-2 tabular-nums">
                {query.data?.pages[0].total.toLocaleString()}{' '}
                {global ? (query.data?.pages[0].total === 1 ? 'result' : 'results') : 'countries'}
              </span>
            </span>
            <span className="hidden sm:block">Publication</span>
            <span className="hidden sm:block">Evidence</span>
          </div>
        </div>
      )}
      {rows.length === 0 && (
        <AdminEmpty
          noun="geographic records"
          filtered={
            !!filters.search ||
            !!filters.type ||
            !!filters.continent ||
            !!filters.region ||
            !!filters.status
          }
          description={
            parentId
              ? 'Add a subitem from the selected record.'
              : 'Add a country to start the hierarchy.'
          }
        />
      )}
      {rows.map((row) => {
        const Icon = ICONS[row.place_type];
        const flag = row.place_type === 'country' ? codeToFlagEmoji(row.country_code) : null;
        const open = expanded.has(row.id);
        return (
          <div key={row.id}>
            <div
              className={`relative flex min-h-16 items-center gap-2 border-b border-l-2 pr-4 ${selectedId === row.id ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-muted/50'}`}
              style={{ paddingLeft: `${depth * 24 + 14}px` }}
            >
              {depth > 0 && (
                <span
                  aria-hidden
                  className="absolute bottom-0 top-0 w-px bg-border"
                  style={{ left: `${depth * 24}px` }}
                />
              )}
              {row.child_count ? (
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-element focus-visible:outline focus-visible:outline-2"
                  aria-label={`${open ? 'Collapse' : 'Expand'} ${row.name}`}
                  aria-expanded={open}
                  disabled={!row.child_count}
                  onClick={() => onExpand(row.id)}
                >
                  {!!row.child_count &&
                    (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden>
                  <span className="h-px w-2 bg-border" />
                </span>
              )}
              <button
                type="button"
                aria-pressed={selectedId === row.id}
                onClick={() => onSelect(row.id)}
                className={`${ROW_COLUMNS} min-h-16 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {flag ? (
                    <span
                      aria-hidden
                      className="flex h-4 w-4 shrink-0 items-center justify-center text-15 leading-none"
                    >
                      {flag}
                    </span>
                  ) : (
                    <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-15 font-medium" title={row.name}>
                        {row.name}
                      </span>
                      {row.safety_gated && (
                        <Lock size={14} className="shrink-0" aria-label="Safety gated" />
                      )}
                    </span>
                    <span className="block truncate text-13 text-muted-foreground" title={row.path}>
                      {global
                        ? row.path
                        : `${geographyLabels[row.place_type]}${row.place_type === 'city' && row.region_code ? ` · ${row.region_code}` : ''}`}
                      {row.child_count
                        ? ` · ${row.child_count.toLocaleString()} ${row.place_type === 'country' ? (row.child_count === 1 ? 'city' : 'cities') : row.child_count === 1 ? 'village' : 'villages'}`
                        : ''}
                    </span>
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      {row.workflow_state ?? (row.seo_indexable ? 'Indexable' : 'Not indexed')}
                    </span>
                  </span>
                </span>
                <span className="hidden truncate text-13 text-muted-foreground sm:block">
                  {row.workflow_state ?? (row.seo_indexable ? 'Indexable' : 'Not indexed')}
                </span>
                <span
                  className={`flex items-center gap-2 pl-6 text-13 sm:pl-0 ${row.verification_status === 'review' ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.verification_status === 'review' ? 'bg-destructive' : row.verification_status === 'verified' ? 'bg-primary' : 'bg-muted-foreground/50'}`}
                  />
                  {verificationLabels[row.verification_status]}
                </span>
              </button>
            </div>
            {open && !!row.child_count && (
              <GeographyRows
                parentId={row.id}
                filters={EMPTY_FILTERS}
                depth={depth + 1}
                selectedId={selectedId}
                expanded={expanded}
                onExpand={onExpand}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
      {query.hasNextPage && (
        <Button
          variant="ghost"
          className="m-2"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? (
            <AdminInlineSpinner />
          ) : (
            `Load more (${rows.length} of ${query.data?.pages[0].total})`
          )}
        </Button>
      )}
    </div>
  );
}

function MoveGeography({ record, onClose }: { record: GeographyRecord; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const type = record.place_type === 'city' ? 'country' : 'city';
  const candidates = useGeographyRows(null, {
    ...EMPTY_FILTERS,
    type,
    search: useDeferredValue(search),
  });
  const move = useMoveGeography(record);
  const { toast } = useToast();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change parent of {record.name}</DialogTitle>
        </DialogHeader>
        <p className="text-13 text-muted-foreground">
          Choose a {geographyLabels[type].toLowerCase()}. The CMS relationship, descendants, linked
          content and safety gates update together.
        </p>
        <Input
          aria-label="Search parents"
          placeholder={`Search ${type === 'city' ? 'cities' : 'countries'}…`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="max-h-72 overflow-auto">
          {candidates.isLoading && <AdminTextSkeleton lines={3} />}
          {candidates.isError && <p role="alert">{candidates.error.message}</p>}
          {candidates.data?.pages
            .flatMap((page) => page.rows)
            .filter((row) => row.id !== record.parent_id)
            .map((row) => (
              <Button
                key={row.id}
                variant="ghost"
                className="h-auto min-h-11 w-full justify-start whitespace-normal text-left"
                disabled={move.isPending}
                onClick={() =>
                  move.mutate(row.id, {
                    onSuccess: () => {
                      toast({ title: `Updated parent of ${record.name}` });
                      onClose();
                    },
                  })
                }
              >
                {row.path}
              </Button>
            ))}
          {candidates.data?.pages[0].total === 0 && (
            <p className="p-2 text-13">No matching parents.</p>
          )}
          {candidates.hasNextPage && (
            <Button
              variant="outline"
              disabled={candidates.isFetchingNextPage}
              onClick={() => void candidates.fetchNextPage()}
            >
              More parents
            </Button>
          )}
        </div>
        {move.isError && (
          <p role="alert" className="text-13 text-destructive">
            {move.error.message}
          </p>
        )}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function GeographyDetail({
  record,
  onEdit,
  onCreate,
  onClose,
}: {
  record: GeographyRecord;
  onEdit: () => void;
  onClose: () => void;
  onCreate: (type: GeographyType) => void;
}) {
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [record.id]);
  const [moving, setMoving] = useState(false);
  const verify = useVerifyGeography();
  const href = livePath(record.source_table, record as unknown as Record<string, unknown>);
  const editHref = cmsEditPath(record.source_table, record.id);
  const childType =
    record.place_type === 'country' ? 'city' : record.place_type === 'city' ? 'village' : null;
  return (
    <section
      aria-label="Selected geography"
      ref={detailRef}
      tabIndex={-1}
      className="order-first flex min-w-0 flex-col gap-4 focus:outline-none lg:order-last lg:sticky lg:top-4"
    >
      <Button
        variant="ghost"
        className="self-start lg:hidden"
        onClick={() => {
          const hierarchy = document.getElementById('geography-hierarchy');
          hierarchy?.focus({ preventScroll: true });
          hierarchy?.scrollIntoView({ block: 'start' });
        }}
      >
        Back to hierarchy
      </Button>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-13 text-muted-foreground break-words">{record.path}</p>
          <h2 className="text-title font-semibold">{record.name}</h2>
          <p className="text-13 text-muted-foreground">
            {geographyLabels[record.place_type]} ·{' '}
            {record.workflow_state ?? (record.seo_indexable ? 'Indexable' : 'Not indexed')}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close record details" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onEdit}>
          <Pencil size={16} className="mr-2" />
          Edit record
        </Button>
        {childType && (
          <Button variant="outline" onClick={() => onCreate(childType)}>
            <Plus size={16} className="mr-2" />
            Add {geographyLabels[childType].toLowerCase()}
          </Button>
        )}
        {record.place_type !== 'country' && (
          <Button variant="outline" onClick={() => setMoving(true)}>
            <Move size={16} className="mr-2" />
            Change parent
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y py-4 text-13">
        <dt>CMS table</dt>
        <dd className="break-all">{record.source_table}</dd>
        <dt>Parent field</dt>
        <dd>
          {record.place_type === 'city'
            ? 'country_id'
            : record.place_type === 'village'
              ? 'city_id'
              : 'continent_id / region_id'}
        </dd>
        <dt>Country</dt>
        <dd>{record.country_name}</dd>
        {record.place_type === 'village' && (
          <>
            <dt>City</dt>
            <dd>{record.city_name}</dd>
          </>
        )}
        <dt>Coordinates</dt>
        <dd>
          {record.latitude == null || record.longitude == null
            ? 'Missing'
            : `${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}`}
        </dd>
        <dt>Subitems</dt>
        <dd>{record.child_count}</dd>
        <dt>Linked content</dt>
        <dd>
          {record.venue_count} venues · {record.event_count} events · {record.hotel_count} hotels
        </dd>
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-15 font-semibold">Geographic evidence</h3>
        <Badge variant="outline" className="self-start">
          {verificationLabels[record.verification_status]}
        </Badge>
        <p className="text-13 text-muted-foreground">
          {record.verification?.checks.reason ??
            'No recorded geographic check. Check the country and inspect external sources before confirming identity or parentage.'}
        </p>
        {record.verification && (
          <p className="text-13 text-muted-foreground">
            Checked {new Date(record.verification.checked_at).toLocaleString()}
            {typeof record.verification.checks.distance_to_city_m === 'number' &&
              ` · ${(record.verification.checks.distance_to_city_m / 1000).toFixed(1)} km from city centre`}
          </p>
        )}
        {record.verification?.sources.map((source) => (
          <a
            key={source.url}
            className="text-13 underline underline-offset-4"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.title}
            {source.version ? ` (${source.version})` : ''}
          </a>
        ))}
        {typeof record.verification?.checks.external_distance_m === 'number' && (
          <p className="text-13">
            {(record.verification.checks.external_distance_m / 1000).toFixed(1)} km from the
            external reference pin.
          </p>
        )}
        <Button
          variant="outline"
          className="self-start"
          disabled={verify.isPending}
          onClick={() => verify.mutate(record.id)}
        >
          {verify.isPending ? 'Checking…' : 'Check geography'}
        </Button>
        {verify.isError && (
          <p role="alert" className="text-13 text-destructive">
            {verify.error.message}
          </p>
        )}
        <p className="text-13 text-muted-foreground">
          A country match does not verify village boundaries or queer significance. Border, identity
          and parent conflicts need review.
        </p>
      </div>
      <div className="flex flex-wrap gap-4 text-13">
        {href && (
          <a
            className="inline-flex items-center gap-1 underline"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            View public page
            <ExternalLink size={14} />
          </a>
        )}
        {editHref && (
          <a className="underline" href={editHref}>
            Direct CMS link
          </a>
        )}
      </div>
      {record.place_type !== 'country' && <GeographyLandmarks record={record} />}
      {moving && <MoveGeography record={record} onClose={() => setMoving(false)} />}
    </section>
  );
}

export default function AdminGeography() {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const { openEditor } = useAdminShell();
  const options = useGeographyFilters();
  const selectedId = params.get('selected');
  const record = useGeographyRecord(selectedId);
  const integrity = useGeoIntegrityViolations();
  const search = params.get('q') ?? '';
  const rawType = params.get('type');
  const type: GeographyType | null =
    rawType === 'country' || rawType === 'city' || rawType === 'village' ? rawType : null;
  const rawStatus = params.get('status');
  const status =
    rawStatus && Object.hasOwn(verificationLabels, rawStatus)
      ? (rawStatus as GeographyRecord['verification_status'])
      : null;
  const filters: GeographyFilters = {
    search: useDeferredValue(search),
    type,
    continent: params.get('continent'),
    region: params.get('region'),
    status,
  };
  const expanded = new Set((params.get('expanded') ?? '').split(',').filter(Boolean));
  const change = (key: string, value: string | null) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const editType = params.get('editing');
  const createType = params.get('create');
  const create: GeographyType | null =
    createType === 'country' || createType === 'city' || createType === 'village'
      ? createType
      : null;
  const editing = editType && record.data?.source_table === editType ? record.data : null;
  if (editing || create)
    return (
      <CMSEditorLayout
        contentType={editing?.source_table ?? TABLES[create!]}
        itemId={editing?.id ?? null}
        initialValues={
          create === 'city' && record.data?.place_type === 'country'
            ? { country_id: record.data.id }
            : create === 'village' && record.data?.place_type === 'city'
              ? { city_id: record.data.id, country_id: record.data.country_id }
              : undefined
        }
        onClose={() =>
          setParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.delete('editing');
              next.delete('create');
              return next;
            },
            { replace: true },
          )
        }
        onSaved={(id) => {
          void client.invalidateQueries();
          change('selected', id);
        }}
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <AdminArchetypeHeader
        title="Geography"
        routeLine={null}
        actions={
          <Button onClick={() => change('create', 'country')}>
            <Plus size={16} className="mr-2" />
            Add country
          </Button>
        }
      />
      <p className="text-15 text-muted-foreground">
        Countries → Cities → Queer Villages. Browse the hierarchy and edit the linked CMS records
        here.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search geography"
          className="w-full sm:w-72"
          placeholder="Search countries, cities or villages…"
          value={search}
          onChange={(event) => change('q', event.target.value)}
        />
        <select
          aria-label="Geography type"
          className="h-11 rounded-element border bg-background px-4 text-13"
          value={type ?? ''}
          onChange={(event) => change('type', event.target.value)}
        >
          <option value="">Hierarchy</option>
          <option value="country">Countries</option>
          <option value="city">Cities</option>
          <option value="village">Queer Villages</option>
        </select>
        <select
          aria-label="Continent"
          className="h-11 rounded-element border bg-background px-4 text-13"
          value={filters.continent ?? ''}
          onChange={(event) =>
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous);
                next.delete('region');
                if (event.target.value) next.set('continent', event.target.value);
                else next.delete('continent');
                return next;
              },
              { replace: true },
            )
          }
        >
          <option value="">All continents</option>
          {options.data?.continents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Region"
          className="h-11 rounded-element border bg-background px-4 text-13"
          value={filters.region ?? ''}
          onChange={(event) => change('region', event.target.value)}
        >
          <option value="">All regions</option>
          {options.data?.regions
            .filter((item) => !filters.continent || item.continent_id === filters.continent)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Verification status"
          className="h-11 rounded-element border bg-background px-4 text-13"
          value={status ?? ''}
          onChange={(event) => change('status', event.target.value)}
        >
          <option value="">All evidence statuses</option>
          {Object.entries(verificationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {(search || type || filters.continent || filters.region || status) && (
          <Button
            variant="ghost"
            onClick={() => setParams(selectedId ? { selected: selectedId } : {}, { replace: true })}
          >
            Clear filters
          </Button>
        )}
      </div>
      {options.isError && (
        <p role="alert" className="text-13">
          Could not load geographic filters.{' '}
          <Button variant="ghost" onClick={() => void options.refetch()}>
            Retry
          </Button>
        </p>
      )}
      <div
        className={`grid min-w-0 grid-cols-1 items-start gap-6 ${selectedId ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}
      >
        <section
          id="geography-hierarchy"
          tabIndex={-1}
          aria-label="Geography hierarchy"
          className="order-last min-w-0 overflow-hidden rounded-element border bg-background lg:order-first"
        >
          <div className="flex min-h-12 items-center justify-between gap-4 border-b px-4 py-2">
            <p className="text-13 text-muted-foreground">
              {search || type || status ? 'Matching places' : 'Country hierarchy'}{' '}
              <span className="hidden sm:inline">· Select a place to inspect or edit</span>
            </p>
            {expanded.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  change('expanded', '');
                  document.getElementById('geography-hierarchy')?.focus();
                }}
              >
                Collapse all
              </Button>
            )}
          </div>
          <GeographyRows
            parentId={null}
            filters={filters}
            selectedId={selectedId}
            expanded={expanded}
            onSelect={(id) => change('selected', id)}
            onExpand={(id) => {
              const next = new Set(expanded);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              change('expanded', [...next].join(','));
            }}
          />
        </section>
        {selectedId &&
          (record.isLoading ? (
            <AdminTextSkeleton lines={5} />
          ) : record.isError ? (
            <div role="alert">
              Could not load this record.{' '}
              <Button variant="outline" onClick={() => void record.refetch()}>
                Retry
              </Button>
            </div>
          ) : record.data ? (
            <GeographyDetail
              key={record.data.id}
              record={record.data}
              onClose={() => {
                change('selected', '');
                document.getElementById('geography-hierarchy')?.focus();
              }}
              onEdit={() => change('editing', record.data!.source_table)}
              onCreate={(newType) => change('create', newType)}
            />
          ) : (
            <p className="p-4 text-15 text-muted-foreground">
              {selectedId
                ? 'This geographic record is no longer available. Choose another record.'
                : 'Select a country, city or queer village to inspect its CMS relationship and geographic evidence.'}
            </p>
          ))}
      </div>
      <details className="border-t pt-4">
        <summary className="cursor-pointer text-15 font-semibold">
          Relationship issues
          {integrity.data
            ? ` (${integrity.data.length}${integrity.data.length === 200 ? '+' : ''})`
            : ''}
        </summary>
        {integrity.isError && (
          <p role="alert">
            Could not load relationship issues.{' '}
            <Button onClick={() => void integrity.refetch()}>Retry</Button>
          </p>
        )}
        {integrity.isLoading && <AdminTextSkeleton lines={2} />}
        {integrity.data?.length === 0 && (
          <p className="py-4 text-13">No relationship conflicts reported.</p>
        )}
        <ul className="divide-y">
          {integrity.data?.map((issue) => (
            <li
              key={`${issue.violation}:${issue.entity_id}`}
              className="flex flex-wrap gap-2 py-4 text-13"
            >
              <span className="font-medium">{issue.entity_name}</span>
              <span className="text-muted-foreground">{issue.violation.replaceAll('_', ' ')}</span>
              <Button
                variant="ghost"
                className="h-auto p-0 underline"
                onClick={() =>
                  openEditor(
                    issue.entity_type === 'event'
                      ? 'events'
                      : issue.entity_type === 'venue'
                        ? 'venues'
                        : issue.entity_type === 'hotel'
                          ? 'hotels'
                          : issue.entity_type === 'village'
                            ? 'queer_villages'
                            : issue.entity_type === 'country'
                              ? 'countries'
                              : 'cities',
                    issue.entity_id,
                  )
                }
              >
                Inspect CMS record
              </Button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
