/**
 * /admin/business — the one business console. Every hotel / venue / merchant /
 * brand / affiliate partner / support org hangs off an organizations-spine row
 * (roles[]).
 *
 * Directory   the spine itself — search + role/claim filters
 * Hotels      accommodation CRUD (absorbed /admin/hotels)
 * Merchants   marketplace vendor registry + sync (absorbed /admin/vendors)
 * Brands      trust-gated ownership review + brand registry (absorbed /admin/brands)
 * Partners    affiliate_partners registry — read live by the /go worker
 * Link review the nightly backfill's ambiguous adoption suggestions
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AffiliatePartnersManager } from '@/components/admin/AffiliatePartnersManager';
import { MerchantsManager } from '@/components/admin/affiliate/MerchantsManager';
import { HotelsManager } from '@/components/admin/business/HotelsManager';
import { OrgLinkReviewQueue } from '@/components/admin/business/OrgLinkReviewQueue';
import { BrandReviewQueue } from '@/components/admin/review-queues/BrandReviewQueue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ORG_ROLE_LABELS, useAdminOrgList, useOrgSpineDrift } from '@/hooks/useBusinessSpine';

const ROLE_FILTERS = ['venue', 'hotel', 'seller', 'affiliate_partner', 'brand', 'publisher', 'support'];

const TABS = ['directory', 'hotels', 'merchants', 'brands', 'partners', 'review'] as const;
type Tab = (typeof TABS)[number];

export default function AdminBusiness() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'directory';
  const roleParam = searchParams.get('role') ?? '';
  const [q, setQ] = useState('');
  const [claim, setClaim] = useState('');
  const [applyingOwnership, setApplyingOwnership] = useState(false);

  // Fans approved ownership tags out to the products that carry the badges.
  const applyOwnership = async () => {
    setApplyingOwnership(true);
    try {
      const { data, error } = await untypedSupabase.rpc('run_marketplace_ownership_apply', {});
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      toast.success(`Ownership applied — ${d.updated ?? 0} products updated`);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setApplyingOwnership(false);
    }
  };

  const { data: orgs, isLoading } = useAdminOrgList({
    q,
    role: roleParam || undefined,
    claimStatus: claim || undefined,
  });
  const { data: drift } = useOrgSpineDrift();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-6 pt-6">
        <AdminPageHeader
          eyebrow="COCKPIT · BUSINESS"
          title="Business"
          subtitle="One console for every business on the platform — venues, hotels, merchants, brands, partners and support orgs, unified on the organizations spine."
          actions={
            tab === 'brands' ? (
              <Button variant="outline" disabled={applyingOwnership} onClick={applyOwnership}>
                {applyingOwnership ? 'Applying…' : 'Apply ownership to products'}
              </Button>
            ) : undefined
          }
        />

        <Tabs
          value={tab}
          onValueChange={(v) => setParam('tab', v === 'directory' ? '' : v)}
          className="mb-6"
        >
          <TabsList>
            <TabsTrigger value="directory">
              Directory{drift ? ` (${drift.organizations_total})` : ''}
            </TabsTrigger>
            <TabsTrigger value="hotels">Hotels</TabsTrigger>
            <TabsTrigger value="merchants">Merchants</TabsTrigger>
            {/* No count: get_admin_counts exposes no brand key (the old
                /admin/brands nav badge read a `review_brands` that never
                existed). The queue itself shows the pending rows. */}
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="partners">Partners</TabsTrigger>
            <TabsTrigger value="review">
              Link review{drift && drift.suggestions_open > 0 ? ` (${drift.suggestions_open})` : ''}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* HotelsManager brings its own AdminEntityTable page shell (incl. p-6). */}
      {tab === 'hotels' && <HotelsManager />}

      {tab === 'merchants' && (
        <div className="px-6 pb-6">
          <MerchantsManager />
        </div>
      )}

      {tab === 'brands' && (
        <div className="px-6 pb-6">
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/content/marketplace_brands">Brand registry (raw list)</Link>
            </Button>
          </div>
          <BrandReviewQueue />
        </div>
      )}

      {/* AffiliatePartnersManager is embedded — the console owns the padding. */}
      {tab === 'partners' && (
        <div className="px-6 pb-6">
          <AffiliatePartnersManager embedded />
        </div>
      )}

      {tab === 'review' && (
        <div className="px-6 pb-6">
          <OrgLinkReviewQueue />
        </div>
      )}

      {tab === 'directory' && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, domain, slug…"
              className="max-w-xs"
            />
            <Select value={roleParam || 'all'} onValueChange={(v) => setParam('role', v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLE_FILTERS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ORG_ROLE_LABELS[r] ?? r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={claim || 'all'} onValueChange={(v) => setClaim(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Claim status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any claim status</SelectItem>
                <SelectItem value="unclaimed">Unclaimed</SelectItem>
                <SelectItem value="pending">Claim pending</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
              </SelectContent>
            </Select>
            {drift && (
              <span className="ml-auto text-13 text-muted-foreground">
                Unlinked: {drift.hotels_unlinked} hotels · {drift.merchants_unlinked} merchants ·{' '}
                {drift.partners_unlinked} partners · {drift.venues_unlinked_quality} venues
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
            </div>
          ) : (orgs ?? []).length === 0 ? (
            <p className="py-8 text-13 text-muted-foreground">No businesses match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Claim</TableHead>
                  <TableHead className="text-right">Trust</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgs ?? []).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link to={`/admin/business/${o.id}`} className="flex items-center gap-2 font-medium">
                        {o.logo_url ? (
                          <img
                            src={o.logo_url}
                            alt=""
                            className="h-6 w-6 rounded-badge object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-badge bg-muted text-2xs uppercase">
                            {o.name.slice(0, 1)}
                          </span>
                        )}
                        {o.name}
                        {o.needs_attention && (
                          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                            attention
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {o.roles.map((r) => (
                          <Badge key={r} variant="outline" className="font-normal">
                            {ORG_ROLE_LABELS[r] ?? r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{o.website_domain ?? '—'}</TableCell>
                    <TableCell>
                      {o.claim_status === 'unclaimed' ? (
                        <span className="text-13 text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="secondary" className="font-normal">
                          {o.claim_status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-13 text-muted-foreground">
                      {o.trust_score ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
