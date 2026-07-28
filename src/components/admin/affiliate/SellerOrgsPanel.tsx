import { useState } from 'react';
import { Link2, Loader2, Unlink } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMarketplaceMerchants, useSellerOrgs } from '@/hooks/useMarketplaceMerchants';
import { toast } from 'sonner';

interface DomainMatch {
  merchant_id: string;
  merchant_slug: string;
  merchant_domain: string;
  organization_id: string;
  organization_name: string;
}

/**
 * Seller organizations and their merchant links. The identity spine: a
 * merchant linked to an organization gains provenance across venues/news/
 * marketplace. Domain matching is the automated path (dry-run first).
 */
export function SellerOrgsPanel() {
  const queryClient = useQueryClient();
  const { data: merchants, upsert } = useMarketplaceMerchants();
  const [matches, setMatches] = useState<DomainMatch[] | null>(null);

  const { data: orgs, isLoading } = useSellerOrgs();

  const preview = useMutation({
    mutationFn: async (): Promise<DomainMatch[]> => {
      const { data, error } = await untypedSupabase.rpc('find_org_merchant_domain_matches');
      if (error) throw error;
      return (data ?? []) as DomainMatch[];
    },
    onSuccess: (rows) => setMatches(rows),
    onError: (e) => toast.error(`Preview failed: ${(e as Error).message}`),
  });

  const linkAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await untypedSupabase.rpc('link_org_merchant_domain_matches', {
        p_dry_run: false,
      });
      if (error) throw error;
      return data as { linked?: number };
    },
    onSuccess: (d) => {
      toast.success(`Linked ${d?.linked ?? 0} merchants to organizations`);
      setMatches(null);
      queryClient.invalidateQueries({ queryKey: ['seller-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-merchants'] });
    },
    onError: (e) => toast.error(`Link failed: ${(e as Error).message}`),
  });

  const unlink = async (merchantId: string, name: string) => {
    try {
      await upsert.mutateAsync({ id: merchantId, organization_id: null });
      toast.success(`Unlinked ${name}`);
      queryClient.invalidateQueries({ queryKey: ['seller-orgs'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unlink failed');
    }
  };

  const merchantsByOrg = new Map<string, typeof merchants>();
  for (const m of merchants ?? []) {
    if (!m.organization_id) continue;
    merchantsByOrg.set(m.organization_id, [...(merchantsByOrg.get(m.organization_id) ?? []), m]);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">
          Seller organizations{' '}
          <span className="text-13 font-normal text-muted-foreground">{orgs?.length ?? 0}</span>
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" disabled={preview.isPending} onClick={() => preview.mutate()}>
            {preview.isPending ? 'Scanning…' : 'Preview domain matches'}
          </Button>
          {matches && matches.length > 0 && (
            <Button
              disabled={linkAll.isPending}
              onClick={() => {
                if (confirm(`Link ${matches.length} merchants to their domain-matched organizations?`))
                  linkAll.mutate();
              }}
            >
              <Link2 className="mr-1 h-4 w-4" />
              Link all ({matches.length})
            </Button>
          )}
        </div>
      </div>

      {matches && (
        <div className="rounded-element border p-4">
          <p className="mb-2 text-13 font-medium">
            {matches.length === 0
              ? 'No unlinked domain matches found.'
              : `${matches.length} unlinked merchants share a domain with an organization:`}
          </p>
          {matches.length > 0 && (
            <ul className="flex flex-col gap-1 text-13 text-muted-foreground">
              {matches.map((m) => (
                <li key={m.merchant_id}>
                  {m.merchant_slug} ({m.merchant_domain}) → {m.organization_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(orgs ?? []).length === 0 ? (
        <p className="text-13 text-muted-foreground">No seller organizations yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Linked merchants</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orgs ?? []).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-muted-foreground">{o.website_domain ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {(merchantsByOrg.get(o.id) ?? []).map((m) => (
                      <Badge key={m.id} variant="outline" className="gap-1 font-normal">
                        {m.display_name}
                        <button
                          type="button"
                          aria-label={`Unlink ${m.display_name}`}
                          onClick={() => unlink(m.id, m.display_name)}
                          className="ml-0.5 opacity-60 hover:opacity-100"
                        >
                          <Unlink size={11} />
                        </button>
                      </Badge>
                    ))}
                    {(merchantsByOrg.get(o.id) ?? []).length === 0 && (
                      <span className="text-13 text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
