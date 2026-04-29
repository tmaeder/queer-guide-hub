import { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      <Box>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>
          (none)
        </Typography>
      </Box>
    );
  }
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
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
    </Box>
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
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            AI suggestion review queue
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Producers (auto-tag-content, future Claude-driven suggesters) write to{' '}
            <code>ai_suggestions</code> with <code>status='pending'</code>. Approving here
            auto-applies for <code>tag</code>, <code>synonym</code>, and{' '}
            <code>cluster_membership</code>; other types are flagged for manual application.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2 }}>
            <TextField
              select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              size="small"
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="applied">Applied</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
              <MenuItem value="expired">Expired</MenuItem>
            </TextField>
            <TextField
              select
              label="Type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              size="small"
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">All types</MenuItem>
              <MenuItem value="tag">Tag</MenuItem>
              <MenuItem value="synonym">Synonym</MenuItem>
              <MenuItem value="alt_text">Alt text</MenuItem>
              <MenuItem value="description">Description</MenuItem>
              <MenuItem value="title">Title</MenuItem>
              <MenuItem value="cluster_membership">Cluster membership</MenuItem>
              <MenuItem value="category">Category</MenuItem>
              <MenuItem value="image_replacement">Image replacement</MenuItem>
              <MenuItem value="translation">Translation</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              Refresh
            </Button>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="info" sx={{ mt: 2 }} onClose={() => setInfo(null)}>
              {info}
            </Alert>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Typography>Loading…</Typography>
      ) : items.length === 0 ? (
        <Typography color="text.secondary">No suggestions match these filters.</Typography>
      ) : (
        <Stack spacing={1}>
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={2}
                  alignItems="flex-start"
                >
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
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
                    </Stack>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                      sx={{ mt: 1.5 }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <PrettyJson value={s.current_value} label="Current" />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <PrettyJson value={s.proposed_value} label="Proposed" />
                      </Box>
                    </Stack>
                    {s.review_notes && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        <Typography variant="caption" component="div">
                          {s.review_notes}
                        </Typography>
                      </Alert>
                    )}
                    {editing?.id === s.id && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Edit proposed_value (JSON):
                        </Typography>
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
                          <Typography variant="caption" color="error">
                            JSON parse error: {editing.parseError}
                          </Typography>
                        )}
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {s.source_model && <>model: {s.source_model} · </>}
                      created {new Date(s.created_at).toLocaleString()}
                      {s.applied_at && <> · applied {new Date(s.applied_at).toLocaleString()}</>}
                    </Typography>
                  </Box>
                  {s.status === 'pending' && editing?.id !== s.id && (
                    <Stack direction="row" spacing={1}>
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
                        onClick={() =>
                          setEditing({
                            id: s.id,
                            draft: JSON.stringify(s.proposed_value, null, 2),
                            parseError: null,
                          })
                        }
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
                    </Stack>
                  )}
                  {editing?.id === s.id && (
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!editing) return;
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
                    </Stack>
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
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
