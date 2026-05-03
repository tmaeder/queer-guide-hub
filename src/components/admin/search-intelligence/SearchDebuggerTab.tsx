import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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
        <div className="flex flex-col gap-2 md:min-w-[180px]">
          <Label htmlFor="sd-index">Index</Label>
          <Select value={index} onValueChange={setIndex}>
            <SelectTrigger id="sd-index">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_INDEXES.map((ix) => (
                <SelectItem key={ix} value={ix}>{ix}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <Label htmlFor="sd-query">Query</Label>
          <Input id="sd-query" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <Label htmlFor="sd-filter">Meili filter</Label>
          <Input
            id="sd-filter"
            placeholder='e.g. country = "DE"'
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button onClick={run} disabled={running || !query}>
          {running ? 'Running…' : 'Run'}
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {result && (
        <>
          <div>
            <p className="text-xs text-muted-foreground">
              Hits {result.summary.hits} / est. total {result.summary.estimatedTotal ?? '?'} ·
              meili {result.summary.processingTimeMs ?? '?'}ms · round-trip{' '}
              {result.summary.roundTripMs}ms
            </p>
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
                      <p className="text-xs text-muted-foreground">
                        id: {String(m.id ?? '—')}
                      </p>
                    </div>
                    <p className="text-sm tabular-nums">
                      {m.score == null ? '—' : m.score.toFixed(3)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <details>
            <summary style={{ cursor: 'pointer' }}>Raw response</summary>
            <pre className="text-xs max-h-[400px] overflow-auto bg-muted p-3 rounded">
              {JSON.stringify(result.raw, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
