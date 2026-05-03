import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { callSearchIntelligence, SearchDebugResult } from '@/hooks/useSearchIntelligence';

const DEFAULT_INDEXES = [
  'venues',
  'events',
  'cities',
  'countries',
  'news',
  'marketplace',
  'personalities',
  'tags',
  'queer_villages',
];

export function SearchDebuggerTab() {
  const [index, setIndex] = useState('venues');
  const [query, setQuery] = useState('gay bar berlin');
  const [filter, setFilter] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SearchDebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    const res = await callSearchIntelligence<SearchDebugResult>('search-debug', {
      method: 'POST',
      body: {
        index,
        query,
        filter: filter || undefined,
        showRankingScore: true,
        showRankingScoreDetails: true,
        limit: 20,
      },
    });
    if (!res.success) setError(res.error);
    else setResult(res.data);
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <Label>Index</Label>
          <Select value={index} onValueChange={setIndex}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_INDEXES.map((ix) => (
                <SelectItem key={ix} value={ix}>
                  {ix}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <Label htmlFor="query">Query</Label>
          <Input
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <Label htmlFor="meili-filter">Meili filter</Label>
          <Input
            id="meili-filter"
            placeholder='e.g. country = "DE"'
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button onClick={run} disabled={running || !query}>
          {running ? 'Running…' : 'Run'}
        </Button>
      </div>

      {error && <p className="text-destructive">{error}</p>}

      {result && (
        <>
          <div>
            <span className="text-xs text-muted-foreground">
              Hits {result.summary.hits} / est. total {result.summary.estimatedTotal ?? '?'} ·
              meili {result.summary.processingTimeMs ?? '?'}ms · round-trip{' '}
              {result.summary.roundTripMs}ms
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {result.summary.topMatches.map((m, i) => (
              <Card key={i}>
                <CardContent>
                  <div className="flex flex-row justify-between items-center">
                    <div>
                      <p className="text-sm font-semibold">
                        {String(m.title ?? '(no title)')}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        id: {String(m.id ?? '—')}
                      </span>
                    </div>
                    <p className="text-sm" style={{ fontFeatureSettings: '"tnum"' }}>
                      {m.score == null ? '—' : m.score.toFixed(3)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <details>
            <summary style={{ cursor: 'pointer' }}>Raw response</summary>
            <pre
              style={{
                fontSize: 12,
                maxHeight: 400,
                overflow: 'auto',
                background: 'rgba(0,0,0,0.04)',
                padding: 12,
              }}
            >
              {JSON.stringify(result.raw, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
