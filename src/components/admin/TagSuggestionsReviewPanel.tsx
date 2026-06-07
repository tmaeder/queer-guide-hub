import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Inbox, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';
import { fetchTagNames } from '@/hooks/useTagNames';

interface TagSuggestion {
  id: string;
  suggestion_type: string;
  entity_id: string | null;
  proposed_value: unknown;
  current_value: unknown;
  source: string;
  source_model: string | null;
  confidence: number | null;
  status: string;
  created_at: string;
}

function proposedText(v: unknown): string {
  const p = (v ?? {}) as Record<string, unknown>;
  if (typeof p.value === 'string') return p.value;
  if (typeof p.image_url === 'string') return p.image_url;
  return JSON.stringify(v);
}

/**
 * Review queue for AI-generated tag enrichment (entity_type='unified_tags').
 * Producers: tag-enrichment-sweep (pure-LLM guesses + sensitive/adult tags route
 * here instead of auto-applying). Approving PATCHes the search-intelligence route
 * which applies the suggestion and flips unified_tags.human_reviewed=true,
 * releasing the SEO sensitivity gate.
 */
export function TagSuggestionsReviewPanel() {
  const [items, setItems] = useState<TagSuggestion[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await callSearchIntelligence<TagSuggestion[]>('suggestions', {
      searchParams: { entity_type: 'unified_tags', status: 'pending', limit: '100' },
    });
    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setError(null);
    setItems(res.data);
    const ids = [...new Set(res.data.map((s) => s.entity_id).filter(Boolean))] as string[];
    if (ids.length) setNames(await fetchTagNames(ids));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs queue state with the edge function on mount.
    refresh();
  }, [refresh]);

  const setStatus = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id);
    setInfo(null);
    const res = await callSearchIntelligence<{ auto_applied?: boolean; apply_error?: string }>(
      `suggestions/${id}`,
      { method: 'PATCH', body: { status } },
    );
    if (!res.success) setError(res.error);
    else {
      const r = res.data as unknown as { auto_applied?: boolean; apply_error?: string | null };
      if (status === 'rejected') setInfo('Rejected.');
      else if (r.auto_applied) setInfo('Approved + applied. Tag marked human-reviewed.');
      else setInfo(r.apply_error ? `Approved, apply failed: ${r.apply_error}` : 'Approved.');
    }
    await refresh();
    setBusy(null);
  };

  const runSweep = async () => {
    setSweeping(true);
    setInfo(null);
    setError(null);
    const { data, error: e } = await supabase.functions.invoke('tag-enrichment-sweep', {
      body: { batch_limit: 20, triggered_by: 'admin' },
    });
    if (e) setError(e.message);
    else {
      const d = (data ?? {}) as Record<string, number>;
      setInfo(
        `Sweep done — ${d.cat_applied ?? 0} categorized · ${d.links_applied ?? 0} links · ` +
          `${d.desc_applied ?? 0} desc applied · ${(d.desc_queued ?? 0) + (d.cat_queued ?? 0)} queued · ` +
          `${d.images_applied ?? 0} images.`,
      );
    }
    await refresh();
    setSweeping(false);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Inbox size={16} />
          Tag enrichment review
          <span className="text-13 font-normal text-muted-foreground">
            {items.length} pending
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-2"
            onClick={runSweep}
            disabled={sweeping}
          >
            <Sparkles size={14} />
            {sweeping ? 'Running…' : 'Run sweep'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {info && (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p className="text-13 text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-13 text-muted-foreground">No tag suggestions pending review.</p>
        ) : (
          items.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-2 rounded-element border bg-muted/40 p-4 md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm">
                    {(s.entity_id && names[s.entity_id]) || s.entity_id?.slice(0, 8) || '—'}
                  </span>
                  <Badge variant="secondary">{s.suggestion_type}</Badge>
                  <Badge variant="outline">{s.source}</Badge>
                  {s.confidence != null && (
                    <Badge variant="outline">conf {s.confidence.toFixed(2)}</Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-13 text-muted-foreground">
                  {proposedText(s.proposed_value)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => setStatus(s.id, 'approved')} disabled={busy === s.id}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setStatus(s.id, 'rejected')}
                  disabled={busy === s.id}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
