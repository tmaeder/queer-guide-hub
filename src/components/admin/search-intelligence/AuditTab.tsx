import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callSearchIntelligence, AuditEntry } from '@/hooks/useSearchIntelligence';

export function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await callSearchIntelligence<AuditEntry[]>('audit', {
        searchParams: {
          action: actionFilter || undefined,
          resource: resourceFilter || undefined,
          limit: '200',
        },
      });
      if (cancelled) return;
      if (!res.success) setError(res.error);
      else {
        setEntries(res.data);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [actionFilter, resourceFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex flex-col gap-2 md:min-w-[200px]">
          <Label htmlFor="action-filter">Action contains</Label>
          <Input
            id="action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 md:min-w-[200px]">
          <Label htmlFor="resource-filter">Resource type</Label>
          <Input
            id="resource-filter"
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading ? (
        <p className="text-sm">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit entries match these filters.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent>
                <div className="flex flex-row gap-4 items-center">
                  <Badge variant="secondary">{e.action}</Badge>
                  <Badge variant="secondary">{e.resource_type}</Badge>
                  {e.resource_id && (
                    <span className="text-xs font-mono">{e.resource_id}</span>
                  )}
                  <div className="flex-1" />
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <pre className="text-[11px] mt-2 bg-muted p-2 overflow-auto rounded">
                    {JSON.stringify(e.metadata, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
