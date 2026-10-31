import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LifeBuoy, Megaphone, Newspaper, Search, ShoppingBag } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { OrganizationCard } from '@/components/organizations/OrganizationCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMeta } from '@/hooks/useMeta';
import { useDebounce } from '@/hooks/useDebounce';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useOrganizationsList, type OrgRole } from '@/hooks/useOrganization';
import { PageContainer } from '@/components/layout/PageContainer';

type Tab = { id: string; label: string; role?: OrgRole; icon?: typeof LifeBuoy };

const TABS: Tab[] = [
  // `all` keeps its id so existing links keep working, but it is an OVERVIEW,
  // not a list. As a list it was the Venues tab twice: the spine mints an
  // organization above every venue (~96k of ~100k rows), and `list_organizations`
  // orders by logo + completeness, so measured on prod all 100 rows it returned
  // were venues — while the lede promised support groups, advocacy, news and shops.
  { id: 'all', label: 'Overview' },
  { id: 'support', label: 'Support', role: 'support', icon: LifeBuoy },
  // Advocacy is deliberately its own tab and not folded into Support: a reader
  // looking for help must not be handed a lobbying group or a dissolved one.
  { id: 'advocacy', label: 'Advocacy', role: 'advocacy', icon: Megaphone },
  { id: 'publisher', label: 'News outlets', role: 'publisher', icon: Newspaper },
  { id: 'seller', label: 'Shops', role: 'seller', icon: ShoppingBag },
  { id: 'organizer', label: 'Organisers', role: 'organizer' },
  { id: 'community', label: 'Community', role: 'community' },
  { id: 'venue', label: 'Venues', role: 'venue' },
];

/** The overview's sections, in the order the lede names them. */
const OVERVIEW: Tab[] = TABS.filter((t) =>
  ['support', 'advocacy', 'publisher', 'seller'].includes(t.id),
);
const OVERVIEW_SIZE = 8;

/**
 * Roles that can be empty. Measured on prod: Community returned 0 rows and
 * Organisers 1, so a tab for each was a click into "No organizations yet."
 * Each is probed with one row and its tab shows only when the probe finds one.
 */
const PROBED = new Set(['organizer', 'community']);

const GRID = 'grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

function CardGrid({ count }: { count: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={300} className="rounded-container" />
      ))}
    </div>
  );
}

function OverviewSection({ tab, onOpen }: { tab: Tab; onOpen: (id: string) => void }) {
  const { data: orgs = [], isLoading } = useOrganizationsList({
    role: tab.role,
    limit: OVERVIEW_SIZE,
  });
  if (!isLoading && orgs.length === 0) return null;
  const Icon = tab.icon;
  return (
    <section aria-labelledby={`orgs-${tab.id}`} className="mb-12">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`orgs-${tab.id}`} className="flex items-center gap-2 font-display text-headline">
          {Icon && <Icon size={22} aria-hidden="true" />}
          {tab.label}
        </h2>
        <button
          type="button"
          onClick={() => onOpen(tab.id)}
          className="text-15 font-bold hover:underline"
        >
          All {tab.label.toLowerCase()} →
        </button>
      </div>
      {isLoading ? (
        <CardGrid count={4} />
      ) : (
        <div className={GRID}>
          {orgs.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Organizations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('role') || 'all';
  const [active, setActive] = useState(TABS.some((t) => t.id === tabParam) ? tabParam : 'all');
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const q = useDebounce(query.trim(), 300);
  const role = useMemo(() => TABS.find((t) => t.id === active)?.role, [active]);

  useMeta({
    title: 'Organizations — Queer Guide',
    description:
      'LGBTQ+ support organizations, advocacy groups, news outlets, and shops — profiles, locations, and how to reach them.',
    canonicalPath: '/organizations',
  });
  useBreadcrumbs([{ label: 'Organizations' }]);

  // One-row probes for the roles that can be empty.
  const { data: organizerProbe = [] } = useOrganizationsList({ role: 'organizer', limit: 1 });
  const { data: communityProbe = [] } = useOrganizationsList({ role: 'community', limit: 1 });
  const probeHit: Record<string, boolean> = {
    organizer: organizerProbe.length > 0,
    community: communityProbe.length > 0,
  };
  const tabs = TABS.filter((t) => !PROBED.has(t.id) || probeHit[t.id] || t.id === active);

  const showOverview = active === 'all' && !q;
  const { data: orgs = [], isLoading } = useOrganizationsList({
    role,
    q: q || undefined,
    limit: 100,
    enabled: !showOverview,
  });

  const updateParams = (next: { role?: string; q?: string }) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.role !== undefined) {
          if (next.role === 'all') p.delete('role');
          else p.set('role', next.role);
        }
        if (next.q !== undefined) {
          if (next.q) p.set('q', next.q);
          else p.delete('q');
        }
        return p;
      },
      { replace: true },
    );

  const onTab = (id: string) => {
    setActive(id);
    updateParams({ role: id });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Organizations"
        subtitle="Support organizations, advocacy groups, news outlets, and shops in the LGBTQ+ community."
      />

      <label className="mb-4 flex h-12 items-center gap-2 bg-card px-4 shadow-soft rounded-container">
        <Search size={20} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="sr-only">Search organizations</span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            updateParams({ q: e.target.value.trim() });
          }}
          placeholder="Search organizations by name"
          className="h-full min-w-0 flex-1 bg-transparent text-15 outline-none"
        />
      </label>

      <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active === tab.id}
              onClick={() => onTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-element border px-4 py-2 text-15 transition-colors ${
                active === tab.id ? 'bg-foreground text-background' : 'border-border hover:bg-muted'
              }`}
            >
              {Icon && <Icon size={15} aria-hidden="true" />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {showOverview ? (
        OVERVIEW.map((tab) => <OverviewSection key={tab.id} tab={tab} onOpen={onTab} />)
      ) : isLoading ? (
        <CardGrid count={8} />
      ) : orgs.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-muted-foreground">
            {q ? `No organizations match “${q}”.` : 'No organizations yet.'}
          </p>
          {q && (
            <Button
              variant="outline"
              onClick={() => {
                setQuery('');
                updateParams({ q: '' });
              }}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className={GRID}>
          {orgs.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
