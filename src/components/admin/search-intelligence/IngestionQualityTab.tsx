import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import LinearProgress from '@mui/material/LinearProgress';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';
import {
  assertVisibilityResult,
  recomputeVisibilityScore,
  scoreLabel,
  VisibilityResult,
  VisibilityAxis,
  VISIBILITY_AXES,
} from '@/lib/visibilityScore';

const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'venue', label: 'Venue' },
  { value: 'event', label: 'Event' },
  { value: 'news_article', label: 'News article' },
  { value: 'marketplace_listing', label: 'Marketplace listing' },
  { value: 'personality', label: 'Personality' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
];

const AXIS_LABEL: Record<VisibilityAxis, string> = {
  tags: 'Tags',
  geo: 'Geo',
  images: 'Images',
  dates: 'Dates',
  text: 'Text',
  synonyms: 'Synonyms',
  queries: 'Queries',
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const label = scoreLabel(score);
  return (
    <Box sx={{ minWidth: 80 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            flex: 1,
            height: 6,
            backgroundColor: 'rgba(0,0,0,0.06)',
            '& .MuiLinearProgress-bar': {
              backgroundColor:
                label === 'high' ? '#10b981' : label === 'medium' ? '#f59e0b' : '#ef4444',
            },
          }}
        />
        <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'right' }}>
          {pct}%
        </Typography>
      </Stack>
    </Box>
  );
}

export function IngestionQualityTab() {
  const [entityType, setEntityType] = useState('venue');
  const [entityId, setEntityId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisibilityResult | null>(null);
  const [drift, setDrift] = useState<number | null>(null);

  const recompute = async () => {
    if (!entityId) {
      setError('Entity id is required');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setDrift(null);
    const res = await callSearchIntelligence(
      `visibility/${entityType}/${entityId}/recompute`,
      { method: 'POST' },
    );
    if (!res.success) {
      setError(res.error);
      setBusy(false);
      return;
    }
    try {
      const validated = assertVisibilityResult(res.data);
      const recomputed = recomputeVisibilityScore(validated);
      setResult(validated);
      setDrift(Math.abs(recomputed - validated.score));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unexpected response shape');
    }
    setBusy(false);
  };

  const fetchExisting = async () => {
    if (!entityId) {
      setError('Entity id is required');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setDrift(null);
    const res = await callSearchIntelligence(`visibility/${entityType}/${entityId}`);
    if (!res.success) {
      setError(res.error);
      setBusy(false);
      return;
    }
    if (!res.data) {
      setError('No score on file. Click Recompute to generate one.');
      setBusy(false);
      return;
    }
    try {
      // Stored row uses the same JSONB structure for breakdown but flat
      // top-level columns. Wrap into the shared shape before validating.
      const stored = res.data as {
        score: number;
        breakdown: Record<string, unknown>;
        suggestions?: string[];
        computed_at: string;
      };
      const validated = assertVisibilityResult({
        entity_type: entityType,
        entity_id: entityId,
        score: stored.score,
        breakdown: stored.breakdown,
        suggestions: stored.suggestions ?? [],
        computed_at: stored.computed_at,
      });
      const recomputed = recomputeVisibilityScore(validated);
      setResult(validated);
      setDrift(Math.abs(recomputed - validated.score));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unexpected response shape');
    }
    setBusy(false);
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Search Visibility Score
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Inspects an entity's tag completeness, geo, image quality, dates, text, synonym
            coverage, and query history. Returns a 0..1 score with axis breakdown and concrete
            suggestions.
          </Typography>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ md: 'flex-end' }}
            sx={{ mt: 2 }}
          >
            <TextField
              select
              label="Entity type"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              sx={{ minWidth: 200 }}
            >
              {ENTITY_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Entity id (uuid)"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              fullWidth
            />
            <Button onClick={fetchExisting} disabled={busy || !entityId} variant="outline">
              Fetch stored
            </Button>
            <Button onClick={recompute} disabled={busy || !entityId}>
              {busy ? 'Computing…' : 'Recompute'}
            </Button>
          </Stack>
          {error && (
            <Typography color="error" sx={{ mt: 2 }}>
              {error}
            </Typography>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardContent>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={3}
                alignItems={{ md: 'center' }}
              >
                <Box sx={{ minWidth: 160 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total score
                  </Typography>
                  <Typography variant="h3" sx={{ fontFeatureSettings: '"tnum"' }}>
                    {Math.round(result.score * 100)}
                    <Typography component="span" variant="h6" color="text.secondary">
                      /100
                    </Typography>
                  </Typography>
                  <Badge
                    variant={
                      scoreLabel(result.score) === 'high'
                        ? 'default'
                        : scoreLabel(result.score) === 'medium'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {scoreLabel(result.score)}
                  </Badge>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Computed at
                  </Typography>
                  <Typography variant="body2">
                    {new Date(result.computed_at).toLocaleString()}
                  </Typography>
                  {drift != null && drift > 0.01 && (
                    <Typography variant="caption" color="warning.main">
                      score drift detected: stored {result.score.toFixed(3)} vs.
                      sum-of-axes {(result.score - drift).toFixed(3)}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Axis breakdown
              </Typography>
              <Stack spacing={1.5}>
                {VISIBILITY_AXES.map((axis) => {
                  const a = result.breakdown[axis];
                  return (
                    <Box key={axis}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Typography variant="subtitle2" sx={{ minWidth: 100 }}>
                          {AXIS_LABEL[axis]}
                        </Typography>
                        <ScoreBar score={a.score} />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ minWidth: 70 }}
                        >
                          weight {(a.weight * 100).toFixed(0)}%
                        </Typography>
                      </Stack>
                      {a.notes.length > 0 && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: 13, display: 'block' }}
                        >
                          {a.notes.join(' · ')}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>

          {result.suggestions.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Suggestions
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {result.suggestions.map((s, i) => (
                    <Box component="li" key={i}>
                      <Typography variant="body2">{s}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}
