import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LifeBuoy, Newspaper, ShoppingBag, Building2 } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useOrganizationsList, type OrgListItem, type OrgRole } from '@/hooks/useOrganization';

const ROLE_LABEL: Partial<Record<OrgRole, string>> = {
  support: 'Support organization',
  publisher: 'News outlet',
  seller: 'Shop',
  venue: 'Physical venue',
};

const TABS: { id: string; label: string; role?: OrgRole }[] = [
  { id: 'all', label: 'All' },
  { id: 'support', label: 'Support', role: 'support' },
  { id: 'publisher', label: 'News outlets', role: 'publisher' },
  { id: 'seller', label: 'Shops', role: 'seller' },
];

function OrgCard({ org }: { org: OrgListItem }) {
  const blurb = org.editorial_hook || org.description;
  return (
    <LocalizedLink to={`/organizations/${org.slug}`}>
      <Card className="h-full transition-colors hover:bg-muted">
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            {org.logo_url ? (
              <img
                src={org.logo_url}
                alt=""
                className="h-10 w-10 shrink-0 rounded-element border border-border object-contain"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-element border border-border text-muted-foreground">
                <Building2 size={18} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">{org.name}</div>
              {org.website_domain && (
                <div className="truncate text-13 text-muted-foreground">{org.website_domain}</div>
              )}
            </div>
          </div>
          {blurb && <p className="line-clamp-2 text-15 text-muted-foreground">{blurb}</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {org.roles.map((r) =>
              ROLE_LABEL[r] ? (
                <Badge key={r} variant="secondary">
                  {ROLE_LABEL[r]}
                </Badge>
              ) : null,
            )}
          </div>
        </CardContent>
      </Card>
    </LocalizedLink>
  );
}

export default function Organizations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('role') || 'all';
  const [active, setActive] = useState(TABS.some((t) => t.id === tabParam) ? tabParam : 'all');
  const role = useMemo(() => TABS.find((t) => t.id === active)?.role, [active]);

  useMeta({
    title: 'Organizations — Queer Guide',
    description:
      'LGBTQ+ support organizations, news outlets, and shops — profiles, locations, and how to reach them.',
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
    <div className="container mx-auto px-4 py-8 md:py-12">
      <PageHeader
        title="Organizations"
        subtitle="Support organizations, news outlets, and shops in the LGBTQ+ community."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon =
            tab.id === 'support'
              ? LifeBuoy
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
                active === tab.id
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {Icon && <Icon size={15} aria-hidden="true" />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={140} className="rounded-container" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <p className="text-muted-foreground">No organizations yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}
