import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  CalendarDays,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  Megaphone,
  Newspaper,
  Search,
  ShoppingBag,
  Store,
  Users,
} from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowRight } from '@/components/icons';
import { OrganizationCard } from '@/components/organizations/OrganizationCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMeta } from '@/hooks/useMeta';
import { useDebounce } from '@/hooks/useDebounce';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import {
  useOrganizationCountries,
  useOrganizationsList,
  type OrgRole,
} from '@/hooks/useOrganization';
import { useHomeRegion } from '@/hooks/useHomeRegion';
import { PageContainer } from '@/components/layout/PageContainer';

type Tab = { id: string; label: string; role?: OrgRole; icon?: typeof LifeBuoy };

const TABS: Tab[] = [
  // `all` keeps its id so existing links keep working, but it is an OVERVIEW,
  // not a list. As a list it was the Venues tab twice: the spine mints an
  // organization above every venue (~96k of ~100k rows), and `list_organizations`
  // orders by logo + completeness, so measured on prod all 100 rows it returned
  // were venues — while the lede promised support groups, advocacy, news and shops.
  { id: 'all', label: 'Overview', icon: LayoutGrid },
  { id: 'support', label: 'Support', role: 'support', icon: LifeBuoy },
  // Advocacy is deliberately its own tab and not folded into Support: a reader
  // looking for help must not be handed a lobbying group or a dissolved one.
  { id: 'advocacy', label: 'Advocacy', role: 'advocacy', icon: Megaphone },
  { id: 'publisher', label: 'News outlets', role: 'publisher', icon: Newspaper },
  { id: 'seller', label: 'Shops', role: 'seller', icon: ShoppingBag },
  { id: 'organizer', label: 'Organisers', role: 'organizer', icon: CalendarDays },
  { id: 'community', label: 'Community', role: 'community', icon: Users },
  { id: 'venue', label: 'Venues', role: 'venue', icon: Store },
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

function OverviewSection({
  tab,
  onOpen,
  countryCode,
}: {
  tab: Tab;
  onOpen: (id: string) => void;
  countryCode?: string;
}) {
  const { data: orgs = [], isLoading } = useOrganizationsList({
    role: tab.role,
    countryCode,
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
  // ISO-2 code, filtered by `list_organizations(p_country_code)` server-side.
  const country = searchParams.get('country')?.toUpperCase() || '';
  const countryCode = country || undefined;
  const { data: countries = [] } = useOrganizationCountries();
  const region = useHomeRegion();
  const nearCode = region.countryCode?.toUpperCase() ?? '';
  const countryName = countries.find((c) => c.code.toUpperCase() === country)?.name ?? country;

  useMeta({
    title: 'Organizations — Queer Guide',
    description:
      'LGBTQ+ support organizations, advocacy groups, news outlets, and shops — profiles, locations, and how to reach them.',
    canonicalPath: '/organizations',
  });
  useBreadcrumbs([{ label: 'Organizations' }]);

  // One-row probes for the roles that can be empty.
  const { data: organizerProbe = [] } = useOrganizationsList({
    role: 'organizer',
    countryCode,
    limit: 1,
  });
  const { data: communityProbe = [] } = useOrganizationsList({
    role: 'community',
    countryCode,
    limit: 1,
  });
  const probeHit: Record<string, boolean> = {
    organizer: organizerProbe.length > 0,
    community: communityProbe.length > 0,
  };
  const tabs = TABS.filter((t) => !PROBED.has(t.id) || probeHit[t.id] || t.id === active);

  const showOverview = active === 'all' && !q;
  // Same query keys as OverviewSection, so React Query dedupes them.
  const overview = {
    support: useOrganizationsList({
      role: 'support',
      countryCode,
      limit: OVERVIEW_SIZE,
      enabled: showOverview,
    }),
    advocacy: useOrganizationsList({
      role: 'advocacy',
      countryCode,
      limit: OVERVIEW_SIZE,
      enabled: showOverview,
    }),
    publisher: useOrganizationsList({
      role: 'publisher',
      countryCode,
      limit: OVERVIEW_SIZE,
      enabled: showOverview,
    }),
    seller: useOrganizationsList({
      role: 'seller',
      countryCode,
      limit: OVERVIEW_SIZE,
      enabled: showOverview,
    }),
  };
  const support = overview.support.data ?? [];
  const advocacy = overview.advocacy.data ?? [];
  const overviewEmpty = Object.values(overview).every(
    (r) => !r.isLoading && (r.data ?? []).length === 0,
  );
  const supportLead = support.find((org) => !org.dissolved_at && org.slug);
  const advocacyLead = advocacy.find(
    (org) => !org.dissolved_at && org.slug && org.id !== supportLead?.id,
  );
  const introductions = [
    { org: supportLead, label: 'Support' },
    { org: advocacyLead, label: 'Advocacy' },
  ];
  const { data: orgs = [], isLoading } = useOrganizationsList({
    role,
    q: q || undefined,
    countryCode,
    limit: 100,
    enabled: !showOverview,
  });

  const updateParams = (next: { role?: string; q?: string; country?: string }) =>
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
        if (next.country !== undefined) {
          if (next.country) p.set('country', next.country);
          else p.delete('country');
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
      <header className="mb-4 grid min-w-0 grid-cols-1 items-end gap-4 md:grid-cols-2 md:gap-8">
        <div>
          <h1 className="font-display text-headline leading-tight md:text-display">
            Organizations
          </h1>
          <p className="mt-1 max-w-reading text-pretty text-15 text-muted-foreground">
            Find queer organizations to turn to, learn from, or get involved with.
          </p>
        </div>
        {showOverview && (supportLead || advocacyLead) && (
          <ul
            aria-label="Organizations to get to know"
            className="divide-y divide-border border-y border-border"
          >
            {introductions.map(
              ({ org, label }) =>
                org && (
                  <li key={org.id}>
                    <LocalizedLink
                      to={`/organizations/${org.slug}`}
                      className="group flex min-h-11 items-center justify-between gap-4 py-1 text-foreground no-underline"
                    >
                      <div className="min-w-0">
                        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                        <p className="truncate text-15 font-semibold group-hover:underline">
                          {org.name}
                        </p>
                      </div>
                      <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
                    </LocalizedLink>
                  </li>
                ),
            )}
          </ul>
        )}
      </header>

      <div className="mb-2 flex flex-wrap gap-2">
        <label className="flex h-11 min-w-0 basis-full items-center gap-2 bg-card px-4 shadow-soft rounded-container sm:basis-0 sm:flex-1">
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
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none md:text-15"
          />
        </label>
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 bg-card px-4 shadow-soft rounded-container sm:max-w-56">
          <MapPin size={20} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          <span className="sr-only">Country</span>
          <select
            value={country}
            onChange={(e) => updateParams({ country: e.target.value })}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none md:text-15"
          >
            <option value="">All countries</option>
            {country && !countries.some((c) => c.code.toUpperCase() === country) && (
              <option value={country}>{country}</option>
            )}
            {countries.map((c) => (
              <option key={c.code} value={c.code.toUpperCase()}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {nearCode && nearCode !== country && (
          <Button
            variant="outline"
            className="h-11"
            onClick={() => updateParams({ country: nearCode })}
          >
            <MapPin size={16} aria-hidden="true" />
            Near me
          </Button>
        )}
      </div>

      <div
        className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Filter by kind"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active === tab.id}
              onClick={() => onTab(tab.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-element px-3 text-13 font-semibold transition-colors ${
                active === tab.id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {Icon && <Icon size={15} aria-hidden="true" />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {showOverview && !(country && overviewEmpty) ? (
        OVERVIEW.map((tab) => (
          <OverviewSection key={tab.id} tab={tab} onOpen={onTab} countryCode={countryCode} />
        ))
      ) : !showOverview && isLoading ? (
        <CardGrid count={8} />
      ) : showOverview || orgs.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-muted-foreground">
            {q
              ? `No organizations match “${q}”${country ? ` in ${countryName}` : ''}.`
              : country
                ? `No organizations in ${countryName} yet.`
                : 'No organizations yet.'}
          </p>
          {country && (
            <Button variant="outline" onClick={() => updateParams({ country: '' })}>
              Show all countries
            </Button>
          )}
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
