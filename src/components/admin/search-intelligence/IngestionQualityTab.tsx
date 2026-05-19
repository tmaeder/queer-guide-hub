import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const color = label === 'high' ? 'hsl(var(--foreground))' : label === 'medium' ? 'hsl(var(--foreground) / 0.55)' : 'hsl(var(--destructive))';
  return (
    <div className="min-w-[80px]">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
          <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <span className="text-xs min-w-[36px] text-right">{pct}%</span>
      </div>
    </div>
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <h6 className="text-lg font-semibold mb-2">Search Visibility Score</h6>
          <p className="text-sm text-muted-foreground mb-4">
            Inspects an entity's tag completeness, geo, image quality, dates, text, synonym
            coverage, and query history. Returns a 0..1 score with axis breakdown and concrete
            suggestions.
          </p>
          <div className="flex flex-col md:flex-row gap-4 md:items-end mt-4">
            <div className="flex flex-col gap-2 min-w-[200px]">
              <Label>Entity type</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <Label>Entity id (uuid)</Label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} />
            </div>
            <Button onClick={fetchExisting} disabled={busy || !entityId} variant="outline">
              Fetch stored
            </Button>
            <Button onClick={recompute} disabled={busy || !entityId}>
              {busy ? 'Computing…' : 'Recompute'}
            </Button>
          </div>
          {error && (
            <p className="text-destructive mt-4">{error}</p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-6 md:items-center">
                <div className="min-w-[160px]">
                  <span className="text-xs text-muted-foreground block">Total score</span>
                  <h3 className="text-3xl" style={{ fontFeatureSettings: '"tnum"' }}>
                    {Math.round(result.score * 100)}
                    <span className="text-lg text-muted-foreground">/100</span>
                  </h3>
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
                </div>
                <div className="flex-1">
                  <span className="text-xs text-muted-foreground block">Computed at</span>
                  <p className="text-sm">
                    {new Date(result.computed_at).toLocaleString()}
                  </p>
                  {drift != null && drift > 0.01 && (
                    <span className="text-xs" style={{ color: 'hsl(var(--warning))' }}>
                      score drift detected: stored {result.score.toFixed(3)} vs.
                      sum-of-axes {(result.score - drift).toFixed(3)}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h6 className="text-lg font-semibold mb-2">Axis breakdown</h6>
              <div className="flex flex-col gap-3">
                {VISIBILITY_AXES.map((axis) => {
                  const a = result.breakdown[axis];
                  return (
                    <div key={axis}>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium min-w-[100px]">
                          {AXIS_LABEL[axis]}
                        </span>
                        <ScoreBar score={a.score} />
                        <span className="text-xs text-muted-foreground min-w-[70px]">
                          weight {(a.weight * 100).toFixed(0)}%
                        </span>
                      </div>
                      {a.notes.length > 0 && (
                        <span className="text-xs text-muted-foreground block ml-[104px]">
                          {a.notes.join(' · ')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {result.suggestions.length > 0 && (
            <Card>
              <CardContent>
                <h6 className="text-lg font-semibold mb-2">Suggestions</h6>
                <ul className="m-0 pl-5 list-disc">
                  {result.suggestions.map((s, i) => (
                    <li key={i}>
                      <p className="text-sm">{s}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
