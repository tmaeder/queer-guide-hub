/**
 * /admin/business — Business console: the organizations spine as one directory.
 * Every hotel/venue/merchant/brand/affiliate partner/support org hangs off an
 * organization row (roles[]). Directory tab lists/filters the spine; Link
 * review tab decides the backfill's ambiguous adoption suggestions.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { OrgLinkReviewQueue } from '@/components/admin/business/OrgLinkReviewQueue';
import { Badge } from '@/components/ui/badge';
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

export default function AdminBusiness() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'review' ? 'review' : 'directory';
  const roleParam = searchParams.get('role') ?? '';
  const [q, setQ] = useState('');
  const [claim, setClaim] = useState('');

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
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COCKPIT · BUSINESS"
        title="Business"
        subtitle="One directory for every business on the platform — venues, hotels, merchants, brands, partners and support orgs, unified on the organizations spine."
      />

      <Tabs value={tab} onValueChange={(v) => setParam('tab', v === 'review' ? 'review' : '')} className="mb-6">
        <TabsList>
          <TabsTrigger value="directory">
            Directory{drift ? ` (${drift.organizations_total})` : ''}
          </TabsTrigger>
          <TabsTrigger value="review">
            Link review{drift && drift.suggestions_open > 0 ? ` (${drift.suggestions_open})` : ''}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'review' ? (
        <OrgLinkReviewQueue />
      ) : (
        <div className="flex flex-col gap-4">
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
