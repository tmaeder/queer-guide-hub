import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Merge, X, Eye, ChevronUp } from 'lucide-react';
import { useEntityById, useDismissDuplicate } from '@/hooks/useImportHubQueries';
import { StructuredFieldDisplay } from './StructuredFieldDisplay';
import type { DuplicatePair } from '@/hooks/useImportHubQueries';
import { brandColors } from '@/theme/muiTheme';

interface DuplicatePairCardProps {
  pair: DuplicatePair;
  onMerge: (pair: DuplicatePair) => void;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = (confidence * 100).toFixed(0);
  const color = confidence >= 0.9 ? '#16a34a' : confidence >= 0.7 ? '#ca8a04' : '#dc2626';
  const label = confidence >= 0.9 ? 'High' : confidence >= 0.7 ? 'Medium' : 'Low';
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5,
      px: 1, py: 0.25, borderRadius: 1,
      bgcolor: `${color}15`, color, fontSize: '0.75rem', fontWeight: 600,
    }}>
      {pct}% ({label})
    </Box>
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
      <CardContent sx={{ p: 2.5 }}>
        {/* Header Row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
            <Badge variant="outline">{pair.entity_type}</Badge>
            <Badge variant="secondary">{pair.match_method}</Badge>
            <ConfidenceBadge confidence={pair.confidence} />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
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
          </Box>
        </Box>

        {/* Quick Preview — always visible */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            A: <span style={{ color: 'var(--foreground)' }}>{pair.entity_a_id.slice(0, 8)}...</span>
          </Typography>
          <Typography variant="body2">vs</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            B: <span style={{ color: 'var(--foreground)' }}>{pair.entity_b_id.slice(0, 8)}...</span>
          </Typography>
        </Box>

        {/* Expanded Details */}
        {expanded && (
          <Box sx={{ mt: 2 }}>
            {(loadingA || loadingB) ? (
              <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', py: 2, textAlign: 'center' }}>
                Loading records...
              </Typography>
            ) : entityA && entityB ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <Card>
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#3b82f6', fontWeight: 600 }}>
                      Record A: {entityA[nameField] || 'Unknown'}
                    </Typography>
                    <StructuredFieldDisplay entityType={pair.entity_type} data={entityA} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, color: brandColors.main, fontWeight: 600 }}>
                      Record B: {entityB[nameField] || 'Unknown'}
                    </Typography>
                    <StructuredFieldDisplay entityType={pair.entity_type} data={entityB} />
                  </CardContent>
                </Card>
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', textAlign: 'center' }}>
                Could not load one or both records.
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
