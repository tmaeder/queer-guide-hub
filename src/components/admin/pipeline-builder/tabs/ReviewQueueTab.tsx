import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, GitMerge, FilePlus2, ClipboardCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Disposition = 'approve' | 'reject' | 'merge' | 'create_new';

interface ReviewItem {
  id: string;
  source_type: string;
  source_name: string | null;
  target_table: string | null;
  entity_type: string | null;
  ai_validation_result: { errors?: string[]; warnings?: string[]; quality?: number } | null;
  ai_confidence_score: number | null;
  dedup_status: string | null;
  dedup_match_id: string | null;
  dedup_match_score: number | null;
  dedup_details: { match_type?: string; rules?: unknown[] } | null;
  normalized_data: Record<string, unknown> | null;
  review_status: string | null;
  created_at: string;
}

type Filter = 'all' | 'venues' | 'hotels' | 'events' | 'personalities' | 'marketplace' | 'cities' | 'countries' | 'merge_candidate';

export default function ReviewQueueTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ReviewItem | null>(null);

  const { data: items = [], isLoading } = useQuery<ReviewItem[]>({
    queryKey: ['review-queue', filter],
    queryFn: async () => {
      let q = supabase
        .from('ingestion_staging')
        .select('id, source_type, source_name, target_table, entity_type, ai_validation_result, ai_confidence_score, dedup_status, dedup_match_id, dedup_match_score, dedup_details, normalized_data, review_status, created_at')
        .eq('review_status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(200);
      if (filter === 'venues' || filter === 'hotels') q = q.eq('target_table', 'venues');
      if (filter === 'events')                        q = q.eq('target_table', 'events');
      if (filter === 'personalities')                 q = q.eq('target_table', 'personalities');
      if (filter === 'marketplace')                   q = q.eq('target_table', 'marketplace_listings');
      if (filter === 'cities')                        q = q.eq('target_table', 'cities');
      if (filter === 'countries')                     q = q.eq('target_table', 'countries');
      if (filter === 'merge_candidate')               q = q.eq('dedup_status', 'merge_candidate');
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ReviewItem[];
      if (filter === 'hotels') return rows.filter(r => !!r.normalized_data?.accommodation_type);
      return rows;
    },
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: async ({ item, disposition, reason }: { item: ReviewItem; disposition: Disposition; reason?: string }) => {
      const update: Record<string, unknown> = {
        review_status: disposition === 'reject' ? 'rejected' : 'approved',
        disposition: disposition === 'reject' ? 'rejected' : 'pending',
        updated_at: new Date().toISOString(),
      };
      if (disposition === 'merge' || disposition === 'create_new') {
        update.dedup_status = disposition === 'create_new' ? 'unique' : 'duplicate';
      }
      const { error: upErr } = await supabase.from('ingestion_staging').update(update).eq('id', item.id);
      if (upErr) throw upErr;

      if (item.dedup_match_id && (disposition === 'merge' || disposition === 'create_new' || disposition === 'reject')) {
        const human = disposition === 'merge' ? 'confirmed_duplicate' : 'not_duplicate';
        await supabase.from('dedup_decisions_feedback').insert({
          staging_id: item.id,
          candidate_venue_id: item.dedup_match_id,
          rpc_score: item.dedup_match_score,
          rpc_match_type: item.dedup_details?.match_type ?? null,
          human_decision: human,
          reason: reason ?? null,
        });
      }
      await supabase.from('ingestion_events').insert({
        staging_id: item.id,
        stage: 'review_gate',
        new_status: disposition === 'reject' ? 'rejected' : 'approved',
        actor: 'admin-ui',
        payload: { disposition, reason: reason ?? null },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      setSelected(null);
    },
    onError: (e: Error) => toast({ title: 'Review action failed', description: e.message, variant: 'destructive' }),
  });

  const counts = useMemo(() => {
    const c = { all: items.length, hotels: 0, merge: 0 };
    for (const i of items) {
      if (i.normalized_data?.accommodation_type) c.hotels++;
      if (i.dedup_status === 'merge_candidate') c.merge++;
    }
    return c;
  }, [items]);

  const FilterButton = ({ value, label, count }: { value: Filter; label: string; count?: number }) => (
    <button
      onClick={() => setFilter(value)}
      className={`text-xs2 px-2.5 py-1 rounded border transition-colors ${
        filter === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-accent'
      }`}
    >{label}{count != null && <span className="ml-1 opacity-70">{count}</span>}</button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Review Queue</span>
        <Badge variant="outline" className="text-2xs px-1.5 py-0">{items.length} pending</Badge>
        <div className="flex-1" />
        <FilterButton value="all" label="All" />
        <FilterButton value="hotels" label="Hotels/B&Bs" count={counts.hotels} />
        <FilterButton value="venues" label="Venues" />
        <FilterButton value="events" label="Events" />
        <FilterButton value="personalities" label="Personalities" />
        <FilterButton value="marketplace" label="Marketplace" />
        <FilterButton value="cities" label="Cities" />
        <FilterButton value="countries" label="Countries" />
        <FilterButton value="merge_candidate" label="Merge candidates" count={counts.merge} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4">
        {/* Item list */}
        <div className="border border-border rounded-md bg-background overflow-hidden max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">Source</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">Issue</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={3} className="p-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={3} className="p-6 text-center">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 inline mr-1" />
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">Nothing to review</span>
                </td></tr>
              ) : items.map(it => {
                const n = it.normalized_data ?? {};
                const name = String(n.name ?? n.title ?? '(unnamed)');
                const isHotel = !!n.accommodation_type;
                const issue = it.dedup_status === 'merge_candidate'
                  ? `merge: ${it.dedup_details?.match_type ?? '?'} ${(Number(it.dedup_match_score ?? 0) * 100).toFixed(0)}%`
                  : (it.ai_validation_result?.warnings ?? []).slice(0, 2).join(', ') || 'review';
                return (
                  <tr
                    key={it.id}
                    onClick={() => setSelected(it)}
                    className={`border-b border-border/40 cursor-pointer transition-colors ${
                      selected?.id === it.id ? 'bg-primary/10' : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="px-3 py-2 align-top">
                      {isHotel && (
                        <Badge variant="outline" className="text-3xs px-1.5 py-0 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900 mb-1">
                          {String(n.accommodation_type)}
                        </Badge>
                      )}
                      <div className="text-xs2 text-muted-foreground font-mono">{it.source_type}</div>
                    </td>
                    <td className="px-3 py-2 font-medium align-top truncate max-w-[200px]" title={name}>{name}</td>
                    <td className="px-3 py-2 text-xs2 text-amber-700 dark:text-amber-300 align-top">{issue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <div className="border border-border rounded-md bg-background p-4 max-h-[600px] overflow-y-auto">
          {!selected ? (
            <div className="text-muted-foreground text-center py-10 text-sm">Select an item to review</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <Label>Name</Label>
                <div className="text-base font-semibold">{String(selected.normalized_data?.name ?? selected.normalized_data?.title ?? '(unnamed)')}</div>
                <div className="text-xs2 text-muted-foreground font-mono mt-0.5">
                  {selected.target_table} · {selected.source_type}
                </div>
              </div>

              {selected.ai_confidence_score != null && (
                <div>
                  <Label>Confidence</Label>
                  <div className="text-sm font-mono">{(selected.ai_confidence_score * 100).toFixed(0)}%</div>
                </div>
              )}

              {selected.ai_validation_result?.warnings?.length ? (
                <div>
                  <Label>Warnings</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selected.ai_validation_result.warnings.map(w => (
                      <Badge key={w} variant="outline" className="text-2xs px-1.5 py-0 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900">
                        {w}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.dedup_status === 'merge_candidate' && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-3">
                  <Label>Possible duplicate</Label>
                  <div className="text-sm mt-0.5">
                    <span className="font-mono">{selected.dedup_details?.match_type}</span>
                    {' · score '}
                    <span className="font-semibold">{(Number(selected.dedup_match_score ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-xs2 text-muted-foreground mt-1">
                    match_id: <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{selected.dedup_match_id}</code>
                  </div>
                </div>
              )}

              {selected.dedup_status === 'merge_candidate' && selected.target_table === 'events' && selected.dedup_match_id && (
                <EventMergePreview staging={selected.normalized_data ?? {}} existingId={selected.dedup_match_id} />
              )}
              {selected.dedup_status === 'merge_candidate' && selected.target_table === 'personalities' && selected.dedup_match_id && (
                <PersonalityMergePreview staging={selected.normalized_data ?? {}} existingId={selected.dedup_match_id} />
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1">Normalized payload</summary>
                <pre className="text-2xs bg-muted/40 p-2 rounded-md overflow-auto max-h-60 mt-1">
                  {JSON.stringify(selected.normalized_data, null, 2)}
                </pre>
              </details>

              <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ item: selected, disposition: 'approve' })}
                >
                  {decide.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                  Approve
                </Button>

                {selected.dedup_status === 'merge_candidate' && (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ item: selected, disposition: 'merge', reason: 'human-confirmed' })}
                    >
                      <GitMerge className="h-3.5 w-3.5 mr-1.5" />
                      Confirm merge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ item: selected, disposition: 'create_new', reason: 'distinct entity' })}
                    >
                      <FilePlus2 className="h-3.5 w-3.5 mr-1.5" />
                      Create new
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  variant="destructive"
                  disabled={decide.isPending}
                  onClick={() => {
                    const reason = window.prompt('Reason for rejection?') ?? undefined;
                    decide.mutate({ item: selected, disposition: 'reject', reason });
                  }}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-2xs text-muted-foreground uppercase tracking-wider font-medium">{children}</div>;
}

function MergeTable({ title, rows }: { title: string; rows: Array<{ field: string; staged: unknown; existing: unknown }> }) {
  const fmt = (v: unknown) => v == null || v === ''
    ? <span className="text-muted-foreground/60">—</span>
    : String(v);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/40 text-xs2 text-muted-foreground font-medium">
        {title}
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-2 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wider w-[110px]">Field</th>
            <th className="text-left px-2 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wider">Staged</th>
            <th className="text-left px-2 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wider">Existing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const changed = String(r.staged ?? '') !== String(r.existing ?? '');
            return (
              <tr key={r.field} className={`border-b border-border/40 ${changed ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                <td className="px-2 py-1 font-mono text-xs2">{r.field}</td>
                <td className="px-2 py-1 text-xs2 break-words">{fmt(r.staged)}</td>
                <td className="px-2 py-1 text-xs2 break-words">{fmt(r.existing)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PersonalityMergePreview({ staging, existingId }: { staging: Record<string, unknown>; existingId: string }) {
  const { data: existing } = useQuery({
    queryKey: ['personality-merge-candidate', existingId],
    queryFn: async () => {
      const { data, error } = await untypedFrom('personalities')
        .select('id, name, description, bio, birth_date, death_date, profession, nationality, birth_place, image_url, website_url, wikidata_qid, lgbti_connection')
        .eq('id', existingId).single();
      if (error) throw error;
      return data as unknown as Record<string, unknown>;
    },
  });

  if (!existing) return <div className="text-xs text-muted-foreground">Loading candidate…</div>;

  return (
    <MergeTable
      title="Personality — staged vs existing"
      rows={[
        { field: 'name', staged: staging.name, existing: existing.name },
        { field: 'wikidata_qid', staged: staging.wikidata_qid, existing: existing.wikidata_qid },
        { field: 'birth_date', staged: staging.birth_date, existing: existing.birth_date },
        { field: 'death_date', staged: staging.death_date, existing: existing.death_date },
        { field: 'profession', staged: staging.profession, existing: existing.profession },
        { field: 'nationality', staged: staging.nationality, existing: existing.nationality },
        { field: 'birth_place', staged: staging.birth_place, existing: existing.birth_place },
        { field: 'image_url', staged: staging.image_url, existing: existing.image_url },
        { field: 'website_url', staged: staging.website_url, existing: existing.website_url },
        { field: 'lgbti_connection', staged: staging.lgbti_connection, existing: existing.lgbti_connection },
        { field: 'description', staged: staging.description, existing: existing.description },
      ]}
    />
  );
}

function EventMergePreview({ staging, existingId }: { staging: Record<string, unknown>; existingId: string }) {
  const { data: existing } = useQuery({
    queryKey: ['event-merge-candidate', existingId],
    queryFn: async () => {
      const { data, error } = await untypedFrom('events')
        .select('id, title, description, event_type, start_date, end_date, venue_name, city, latitude, longitude, website, ticket_url, edition, data_source, external_id')
        .eq('id', existingId).single();
      if (error) throw error;
      return data as unknown as Record<string, unknown>;
    },
  });

  if (!existing) return <div className="text-xs text-muted-foreground">Loading candidate…</div>;

  const loc = (staging.location as Record<string, unknown>) ?? {};
  const dates = (staging.dates as Record<string, unknown>) ?? {};
  const sg = {
    title: staging.title ?? staging.name,
    start_date: staging.start_date ?? dates.start,
    end_date: staging.end_date ?? dates.end,
    city: loc.city ?? staging.city,
    latitude: loc.lat ?? staging.latitude,
    longitude: loc.lng ?? staging.longitude,
    event_type: staging.event_type,
    website: staging.website,
    venue_name: staging.venue_name,
    edition: staging.edition,
  } as Record<string, unknown>;

  return (
    <MergeTable
      title="Event — staged vs existing"
      rows={[
        { field: 'title', staged: sg.title, existing: existing.title },
        { field: 'event_type', staged: sg.event_type, existing: existing.event_type },
        { field: 'start_date', staged: sg.start_date, existing: existing.start_date },
        { field: 'end_date', staged: sg.end_date, existing: existing.end_date },
        { field: 'venue_name', staged: sg.venue_name, existing: existing.venue_name },
        { field: 'city', staged: sg.city, existing: existing.city },
        { field: 'latitude', staged: sg.latitude, existing: existing.latitude },
        { field: 'longitude', staged: sg.longitude, existing: existing.longitude },
        { field: 'edition', staged: sg.edition, existing: existing.edition },
        { field: 'website', staged: sg.website, existing: existing.website },
      ]}
    />
  );
}

