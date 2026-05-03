import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';

type SuggestionStatus =
  | 'pending'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'superseded'
  | 'expired';

type SuggestionType =
  | 'tag'
  | 'synonym'
  | 'alt_text'
  | 'description'
  | 'title'
  | 'cluster_membership'
  | 'category'
  | 'image_replacement'
  | 'translation'
  | 'other';

interface AiSuggestion {
  id: string;
  suggestion_type: SuggestionType;
  entity_type: string | null;
  entity_id: string | null;
  locale: string | null;
  proposed_value: unknown;
  current_value: unknown;
  source: string;
  source_model: string | null;
  source_run_id: string | null;
  confidence: number | null;
  status: SuggestionStatus;
  reviewer_id: string | null;
  review_notes: string | null;
  approved_at: string | null;
  applied_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<SuggestionStatus, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  approved: 'secondary',
  applied: 'default',
  rejected: 'destructive',
  superseded: 'destructive',
  expired: 'destructive',
};

function PrettyJson({ value, label }: { value: unknown; label: string }) {
  if (value === null || value === undefined) {
    return (
      <div>
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className="text-sm italic text-muted-foreground/60">(none)</p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <pre
        style={{
          fontSize: 12,
          margin: 0,
          padding: 8,
          background: 'rgba(0,0,0,0.04)',
          maxHeight: 200,
          overflow: 'auto',
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function TranslationDiff({ s }: { s: AiSuggestion }) {
  const proposed = (s.proposed_value ?? {}) as { field?: string; value?: string };
  const current = (s.current_value ?? {}) as { value?: string };
  const field = proposed.field;
  const proposedText = proposed.value;
  const sourceText = current.value;
  const targetLocale = s.locale ?? '?';

  if (typeof proposedText !== 'string' || typeof sourceText !== 'string' || !field) {
    return (
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <PrettyJson value={s.current_value} label="Current" />
        </div>
        <div className="flex-1">
          <PrettyJson value={s.proposed_value} label="Proposed" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">
        {field} · source → {targetLocale}
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <span className="text-xs text-muted-foreground">Source</span>
          <p className="text-sm whitespace-pre-wrap">
            {sourceText || <em>(empty)</em>}
          </p>
        </div>
        <div className="flex-1">
          <span className="text-xs text-muted-foreground">{targetLocale}</span>
          <p className="text-sm whitespace-pre-wrap">
            {proposedText || <em>(empty)</em>}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SuggestionsTab() {
  const [items, setItems] = useState<AiSuggestion[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string; parseError: string | null } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await callSearchIntelligence<AiSuggestion[]>('suggestions', {
      searchParams: {
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        limit: '200',
      },
    });
    if (!res.success) setError(res.error);
    else {
      setItems(res.data);
      setError(null);
    }
    setLoading(false);
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setStatus = async (
    id: string,
    status: SuggestionStatus,
    proposedOverride?: unknown,
  ) => {
    setBusy(id);
    setInfo(null);
    const body: Record<string, unknown> = { status };
    if (proposedOverride !== undefined) body.proposed_value = proposedOverride;
    const res = await callSearchIntelligence<{ data: AiSuggestion; auto_applied?: boolean; apply_error?: string }>(
      `suggestions/${id}`,
      {
        method: 'PATCH',
        body,
      },
    );
    if (!res.success) {
      setError(res.error);
    } else {
      const r = res.data as unknown as {
        auto_applied?: boolean;
        apply_error?: string | null;
      };
      if (r.auto_applied) {
        setInfo('Approved + auto-applied.');
      } else if (status === 'approved') {
        setInfo(
          r.apply_error
            ? `Approved, but auto-apply failed: ${r.apply_error}. Edit + retry, or apply manually.`
            : 'Approved. This suggestion type requires manual apply.',
        );
      } else {
        setInfo(`Status set to ${status}.`);
      }
    }
    await refresh();
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-2">AI suggestion review queue</h3>
          <p className="text-sm text-muted-foreground">
            Producers (auto-tag-content, automation taggers, translate-i18n-batch, future
            Claude-driven suggesters) write to <code>ai_suggestions</code>. Approving here
            auto-applies for <code>tag</code>, <code>synonym</code>,{' '}
            <code>cluster_membership</code>, and <code>translation</code>; other types are
            flagged for manual application.
          </p>
          <div className="flex flex-col md:flex-row gap-4 mt-4">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <Label htmlFor="sg-status">Status</Label>
              <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger id="sg-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[200px]">
              <Label htmlFor="sg-type">Type</Label>
              <Select value={typeFilter || '__all__'} onValueChange={(v) => setTypeFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger id="sg-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All types</SelectItem>
                  <SelectItem value="tag">Tag</SelectItem>
                  <SelectItem value="synonym">Synonym</SelectItem>
                  <SelectItem value="alt_text">Alt text</SelectItem>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="cluster_membership">Cluster membership</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="image_replacement">Image replacement</SelectItem>
                  <SelectItem value="translation">Translation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="self-end">
              Refresh
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert className="mt-4">
              <AlertDescription>{info}</AlertDescription>
              <button
                type="button"
                onClick={() => setInfo(null)}
                className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                ×
              </button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">No suggestions match these filters.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row justify-between gap-4 items-start">
                  <div className="flex-1">
                    <div className="flex flex-row items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                      <Badge variant="secondary">{s.suggestion_type}</Badge>
                      {s.entity_type && (
                        <Badge variant="secondary">
                          {s.entity_type}
                          {s.entity_id ? `:${s.entity_id.slice(0, 8)}` : ''}
                        </Badge>
                      )}
                      {s.locale && <Badge variant="secondary">{s.locale}</Badge>}
                      <Badge variant="secondary">{s.source}</Badge>
                      {s.confidence != null && (
                        <Badge variant="secondary">conf {s.confidence.toFixed(2)}</Badge>
                      )}
                    </div>
                    <div className="mt-3">
                      {s.suggestion_type === 'translation' ? (
                        <TranslationDiff s={s} />
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1">
                            <PrettyJson value={s.current_value} label="Current" />
                          </div>
                          <div className="flex-1">
                            <PrettyJson value={s.proposed_value} label="Proposed" />
                          </div>
                        </div>
                      )}
                    </div>
                    {s.review_notes && (
                      <Alert className="mt-2 border-yellow-500">
                        <AlertDescription className="text-xs">{s.review_notes}</AlertDescription>
                      </Alert>
                    )}
                    {editing?.id === s.id && (
                      <div className="mt-2">
                        {s.suggestion_type === 'translation' ? (
                          <>
                            <span className="text-xs text-muted-foreground">
                              Edit translation ({s.locale ?? '?'}):
                            </span>
                            <textarea
                              style={{
                                width: '100%',
                                minHeight: 100,
                                fontSize: 14,
                                padding: 8,
                                background: 'rgba(0,0,0,0.04)',
                                border: '1px solid rgba(0,0,0,0.2)',
                              }}
                              value={editing.draft}
                              onChange={(e) =>
                                setEditing({ id: s.id, draft: e.target.value, parseError: null })
                              }
                            />
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground">
                              Edit proposed_value (JSON):
                            </span>
                            <textarea
                              style={{
                                width: '100%',
                                minHeight: 140,
                                fontFamily: 'monospace',
                                fontSize: 12,
                                padding: 8,
                                background: 'rgba(0,0,0,0.04)',
                                border: '1px solid rgba(0,0,0,0.2)',
                              }}
                              value={editing.draft}
                              onChange={(e) => {
                                const val = e.target.value;
                                let parseError: string | null = null;
                                try {
                                  JSON.parse(val);
                                } catch (err) {
                                  parseError = (err as Error).message;
                                }
                                setEditing({ id: s.id, draft: val, parseError });
                              }}
                            />
                            {editing.parseError && (
                              <span className="text-xs text-destructive">
                                JSON parse error: {editing.parseError}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2 block">
                      {s.source_model && <>model: {s.source_model} · </>}
                      created {new Date(s.created_at).toLocaleString()}
                      {s.applied_at && <> · applied {new Date(s.applied_at).toLocaleString()}</>}
                    </div>
                  </div>
                  {s.status === 'pending' && editing?.id !== s.id && (
                    <div className="flex flex-row gap-2">
                      <Button
                        size="sm"
                        onClick={() => setStatus(s.id, 'approved')}
                        disabled={busy === s.id}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (s.suggestion_type === 'translation') {
                            const proposed = (s.proposed_value ?? {}) as { value?: string };
                            setEditing({
                              id: s.id,
                              draft: proposed.value ?? '',
                              parseError: null,
                            });
                          } else {
                            setEditing({
                              id: s.id,
                              draft: JSON.stringify(s.proposed_value, null, 2),
                              parseError: null,
                            });
                          }
                        }}
                        disabled={busy === s.id}
                      >
                        Edit
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
                  )}
                  {editing?.id === s.id && (
                    <div className="flex flex-row gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!editing) return;
                          if (s.suggestion_type === 'translation') {
                            const original = (s.proposed_value ?? {}) as { field?: string };
                            await setStatus(s.id, 'approved', {
                              field: original.field,
                              value: editing.draft,
                            });
                            setEditing(null);
                            return;
                          }
                          if (editing.parseError) return;
                          let parsed: unknown;
                          try {
                            parsed = JSON.parse(editing.draft);
                          } catch (err) {
                            setEditing({
                              ...editing,
                              parseError: (err as Error).message,
                            });
                            return;
                          }
                          await setStatus(s.id, 'approved', parsed);
                          setEditing(null);
                        }}
                        disabled={busy === s.id || !!editing.parseError}
                      >
                        Save &amp; Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(null)}
                        disabled={busy === s.id}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                  {s.status === 'approved' && s.review_notes && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus(s.id, 'approved')}
                      disabled={busy === s.id}
                    >
                      Retry apply
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
