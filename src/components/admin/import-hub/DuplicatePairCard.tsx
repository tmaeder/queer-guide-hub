import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Merge, X, Eye, ChevronUp } from 'lucide-react';
import { useEntityById, useDismissDuplicate } from '@/hooks/useImportHubQueries';
import { StructuredFieldDisplay } from './StructuredFieldDisplay';
import type { DuplicatePair } from '@/hooks/useImportHubQueries';

interface DuplicatePairCardProps {
  pair: DuplicatePair;
  onMerge: (pair: DuplicatePair) => void;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = (confidence * 100).toFixed(0);
  const color = confidence >= 0.9 ? '#16a34a' : confidence >= 0.7 ? '#ca8a04' : '#dc2626';
  const label = confidence >= 0.9 ? 'High' : confidence >= 0.7 ? 'Medium' : 'Low';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {pct}% ({label})
    </span>
  );
}

export function DuplicatePairCard({ pair, onMerge }: DuplicatePairCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: entityA, isLoading: loadingA } = useEntityById(pair.entity_type, expanded ? pair.entity_a_id : null);
  const { data: entityB, isLoading: loadingB } = useEntityById(pair.entity_type, expanded ? pair.entity_b_id : null);
  const dismissMutation = useDismissDuplicate();

  const nameField = pair.entity_type === 'events' ? 'title' : 'name';

  return (
    <Card>
      <CardContent>
        {/* Header Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Badge variant="outline">{pair.entity_type}</Badge>
            <Badge variant="secondary">{pair.match_method}</Badge>
            <ConfidenceBadge confidence={pair.confidence} />
          </div>

          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              style={{ display: 'flex', gap: 6 }}
            >
              {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
              {expanded ? 'Collapse' : 'Compare'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dismissMutation.mutate(pair.id)}
              disabled={dismissMutation.isPending}
              style={{ display: 'flex', gap: 6 }}
            >
              <X style={{ width: 14, height: 14 }} />
              Not Duplicate
            </Button>
            <Button
              size="sm"
              onClick={() => onMerge(pair)}
              style={{ display: 'flex', gap: 6, backgroundColor: '#3b82f6', color: 'white' }}
            >
              <Merge style={{ width: 14, height: 14 }} />
              Merge
            </Button>
          </div>
        </div>

        {/* Quick Preview — always visible */}
        <div className="flex gap-4 items-center text-muted-foreground text-sm">
          <p className="font-medium">
            A: <span className="text-foreground">{pair.entity_a_id.slice(0, 8)}...</span>
          </p>
          <p>vs</p>
          <p className="font-medium">
            B: <span className="text-foreground">{pair.entity_b_id.slice(0, 8)}...</span>
          </p>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-4">
            {(loadingA || loadingB) ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Loading records...
              </p>
            ) : entityA && entityB ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent>
                    <p className="mb-2 text-sm font-semibold" style={{ color: '#3b82f6' }}>
                      Record A: {entityA[nameField] || 'Unknown'}
                    </p>
                    <StructuredFieldDisplay entityType={pair.entity_type} data={entityA} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="mb-2 text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                      Record B: {entityB[nameField] || 'Unknown'}
                    </p>
                    <StructuredFieldDisplay entityType={pair.entity_type} data={entityB} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                Could not load one or both records.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
