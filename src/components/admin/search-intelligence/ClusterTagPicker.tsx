import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { searchUnifiedTagsByName } from '@/hooks/usePageFetchers';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';

interface UnifiedTag {
  id: string;
  name: string;
  slug: string;
}

interface ClusterTag {
  tag_id: string;
  weight: number | null;
  added_at: string | null;
  unified_tags: { id: string; name: string; slug: string } | null;
}

interface ClusterDetail {
  cluster: { id: string; name: string };
  tags: ClusterTag[];
  entity_counts: Array<{ entity_type: string; entity_count: number }>;
}

interface Props {
  clusterId: string;
  onChange?: () => void;
}

/**
 * Inline tag-picker for a cluster row. Shows linked tags, lets the admin
 * type to search unified_tags, click a result to link, click an X to unlink.
 *
 * Search hits Supabase REST directly (cheaper than wrapping in the edge
 * function for a simple ILIKE), still RLS-gated by unified_tags' default
 * read policy.
 */
export function ClusterTagPicker({ clusterId, onChange }: Props) {
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedTag[]>([]);

  const refresh = async () => {
    setLoading(true);
    const res = await callSearchIntelligence<ClusterDetail>(`clusters/${clusterId}`);
    if (!res.success) setError(res.error);
    else {
      setDetail(res.data);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      const data = await searchUnifiedTagsByName<UnifiedTag>(q);
      setResults(data);
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  const linkTag = async (tagId: string) => {
    setBusy(`link-${tagId}`);
    const res = await callSearchIntelligence(`clusters/${clusterId}/tags`, {
      method: 'POST',
      body: { tag_id: tagId },
    });
    if (!res.success) setError(res.error);
    else {
      setQuery('');
      setResults([]);
      await refresh();
      onChange?.();
    }
    setBusy(null);
  };

  const unlinkTag = async (tagId: string) => {
    setBusy(`unlink-${tagId}`);
    const res = await callSearchIntelligence(`clusters/${clusterId}/tags/${tagId}`, {
      method: 'DELETE',
    });
    if (!res.success) setError(res.error);
    else {
      await refresh();
      onChange?.();
    }
    setBusy(null);
  };

  if (loading && !detail) return <Typography variant="caption">Loading tags…</Typography>;

  const linkedIds = new Set((detail?.tags ?? []).map((t) => t.tag_id));
  const filteredResults = results.filter((r) => !linkedIds.has(r.id));

  return (
    <Box sx={{ mt: 1.5, p: 1.5, background: 'rgba(0,0,0,0.03)' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        Linked tags ({detail?.tags.length ?? 0})
      </Typography>
      {detail && detail.tags.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', mb: 1.5 }}>
          {detail.tags.map((t) => (
            <Stack
              key={t.tag_id}
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{ mr: 0.5, mb: 0.5 }}
            >
              <Badge variant="secondary">
                {t.unified_tags?.name ?? t.tag_id.slice(0, 8)}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unlinkTag(t.tag_id)}
                disabled={busy === `unlink-${t.tag_id}`}
                style={{ minWidth: 0, padding: '0 6px', fontSize: 11 }}
              >
                ×
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
      {detail && detail.entity_counts.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Entities reached:{' '}
          {detail.entity_counts
            .map((e) => `${e.entity_count} ${e.entity_type}${e.entity_count === 1 ? '' : 's'}`)
            .join(' · ')}
        </Typography>
      )}
      <TextField
        size="small"
        fullWidth
        placeholder="Type a tag name to add (≥ 2 chars)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim().length >= 2 && (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', mt: 1 }}>
          {filteredResults.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No matches. Tags must exist in unified_tags before linking.
            </Typography>
          ) : (
            filteredResults.map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant="outline"
                onClick={() => linkTag(r.id)}
                disabled={busy === `link-${r.id}`}
                style={{ marginRight: 4, marginBottom: 4 }}
              >
                + {r.name}
              </Button>
            ))
          )}
        </Stack>
      )}
    </Box>
  );
}
