/**
 * Link Health tab — global link_health rollup across marketplace listings,
 * per-merchant breakdown (admin_merchant_overview), and the most recently
 * broken listings. Data is written by the daily marketplace-link-checker cron.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Stat } from './Stat';
import type { MerchantOverviewRow } from './merchantTypes';

interface BrokenListing {
  id: string;
  title: string;
  merchant_domain: string | null;
  link_health: string;
  link_checked_at: string | null;
  external_url: string | null;
  affiliate_url: string | null;
}

const HEALTH_STATES = ['ok', 'redirect', 'broken', 'timeout', 'unchecked'] as const;

export function LinkHealthPanel({ days }: { days: string }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: rollup } = useQuery({
    queryKey: ['link-health-rollup'],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        HEALTH_STATES.map(async (state) => {
          const { count } = await untypedSupabase
            .from('marketplace_listings')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .eq('link_health', state);
          counts[state] = count ?? 0;
        }),
      );
      return counts;
    },
  });

  const { data: merchants } = useQuery({
    queryKey: ['merchant-overview', days],
    queryFn: async (): Promise<MerchantOverviewRow[]> => {
      const { data, error } = await untypedSupabase.rpc('admin_merchant_overview', { p_days: Number(days) });
      if (error) throw error;
      return (data ?? []) as MerchantOverviewRow[];
    },
  });

  const { data: broken } = useQuery({
    queryKey: ['broken-listings'],
    queryFn: async (): Promise<BrokenListing[]> => {
      const { data, error } = await untypedSupabase
        .from('marketplace_listings')
        .select('id, title, merchant_domain, link_health, link_checked_at, external_url, affiliate_url')
        .in('link_health', ['broken', 'timeout'])
        .order('link_checked_at', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BrokenListing[];
    },
  });

  const runChecker = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('marketplace-link-checker', { body: { batch_limit: 200 } });
      if (error) throw error;
      toast.success('Link checker run started (batch of 200)');
      queryClient.invalidateQueries({ queryKey: ['link-health-rollup'] });
      queryClient.invalidateQueries({ queryKey: ['broken-listings'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const merchantsWithIssues = (merchants ?? []).filter(
    (m) => Number(m.link_broken) + Number(m.link_timeout) + Number(m.link_redirect) > 0,
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-15 font-semibold">Active-listing link health</h2>
        <Button onClick={runChecker} disabled={running} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${running ? 'animate-spin' : ''}`} />
          Run link checker
        </Button>
      </div>

      <div className="mb-8 grid grid-cols-5 gap-4">
        {HEALTH_STATES.map((state) => (
          <Stat key={state} label={state} value={(rollup?.[state] ?? 0).toLocaleString()} />
        ))}
      </div>

      {merchantsWithIssues.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-15 font-semibold">By merchant</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead className="text-right">OK</TableHead>
                <TableHead className="text-right">Redirect</TableHead>
                <TableHead className="text-right">Broken</TableHead>
                <TableHead className="text-right">Timeout</TableHead>
                <TableHead className="text-right">Unchecked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merchantsWithIssues.map((m) => (
                <TableRow key={m.merchant_id}>
                  <TableCell className="font-medium">{m.display_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(m.link_ok).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(m.link_redirect).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(m.link_broken) > 0 ? <Badge variant="outline">{Number(m.link_broken)}</Badge> : 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(m.link_timeout).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {Number(m.link_unchecked).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-15 font-semibold">Recently broken listings</h2>
        {!broken?.length ? (
          <p className="text-13 text-muted-foreground">No broken links. Nice.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Checked</TableHead>
                <TableHead className="text-right">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broken.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="max-w-[320px] truncate font-medium">{l.title}</TableCell>
                  <TableCell className="text-muted-foreground">{l.merchant_domain ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.link_health}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.link_checked_at ? new Date(l.link_checked_at).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {(l.external_url ?? l.affiliate_url) && (
                      <a
                        href={l.external_url ?? l.affiliate_url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open destination"
                      >
                        <ExternalLink className="ml-auto w-4 h-4" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
