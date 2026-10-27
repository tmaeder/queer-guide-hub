import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LifeBuoy, Megaphone, Newspaper, ShoppingBag } from '@/components/icons';
import { PageHeader } from '@/components/layout/PageHeader';
import { OrganizationCard } from '@/components/organizations/OrganizationCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useOrganizationsList, type OrgRole } from '@/hooks/useOrganization';
import { PageContainer } from '@/components/layout/PageContainer';

const TABS: { id: string; label: string; role?: OrgRole }[] = [
  { id: 'all', label: 'All' },
  { id: 'venue', label: 'Venues', role: 'venue' },
  { id: 'organizer', label: 'Organisers', role: 'organizer' },
  { id: 'community', label: 'Community', role: 'community' },
  { id: 'support', label: 'Support', role: 'support' },
  // Advocacy is deliberately its own tab and not folded into Support: a reader
  // looking for help must not be handed a lobbying group or a dissolved one.
  { id: 'advocacy', label: 'Advocacy', role: 'advocacy' },
  { id: 'publisher', label: 'News outlets', role: 'publisher' },
  { id: 'seller', label: 'Shops', role: 'seller' },
];

export default function Organizations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('role') || 'all';
  const [active, setActive] = useState(TABS.some((t) => t.id === tabParam) ? tabParam : 'all');
  const role = useMemo(() => TABS.find((t) => t.id === active)?.role, [active]);

  useMeta({
    title: 'Organizations — Queer Guide',
    description:
      'LGBTQ+ support organizations, advocacy groups, news outlets, and shops — profiles, locations, and how to reach them.',
    canonicalPath: '/organizations',
  });
  useBreadcrumbs([{ label: 'Organizations' }]);

  const { data: orgs = [], isLoading } = useOrganizationsList({ role, limit: 100 });

  const onTab = (id: string) => {
    setActive(id);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (id === 'all') p.delete('role');
        else p.set('role', id);
        return p;
      },
      { replace: true },
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Organizations"
        subtitle="Support organizations, advocacy groups, news outlets, and shops in the LGBTQ+ community."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon =
            tab.id === 'support'
              ? LifeBuoy
              : tab.id === 'advocacy'
                ? Megaphone
                : tab.id === 'publisher'
                  ? Newspaper
                  : tab.id === 'seller'
                    ? ShoppingBag
                    : null;
          return (
            <button
              key={tab.id}
              type="button"
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

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={300} className="rounded-container" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <p className="text-muted-foreground">No organizations yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {orgs.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
