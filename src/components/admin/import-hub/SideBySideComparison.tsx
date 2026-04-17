import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ArrowRight, Merge } from 'lucide-react';
import { getFieldsForEntity, type FieldDef } from './StructuredFieldDisplay';
import { brandColors } from '@/theme/muiTheme';

interface SideBySideComparisonProps {
  entityType: string;
  leftData: Record<string, unknown>;
  rightData: Record<string, unknown>;
  leftLabel?: string;
  rightLabel?: string;
  leftId?: string;
  rightId?: string;
  onMerge?: (mergedData: Record<string, unknown>, keepId: string, removeId: string) => void;
  onKeepLeft?: () => void;
  onKeepRight?: () => void;
  onCancel?: () => void;
  showActions?: boolean;
}

type FieldChoice = 'left' | 'right';

function pickBetterValue(leftVal: unknown, rightVal: unknown, type: FieldDef['type']): FieldChoice {
  const leftEmpty = leftVal === null || leftVal === undefined || leftVal === '';
  const rightEmpty = rightVal === null || rightVal === undefined || rightVal === '';

  if (leftEmpty && !rightEmpty) return 'right';
  if (!leftEmpty && rightEmpty) return 'left';
  if (leftEmpty && rightEmpty) return 'left';

  // For text/textarea, prefer longer string
  if (type === 'text' || type === 'textarea') {
    const leftLen = String(leftVal).length;
    const rightLen = String(rightVal).length;
    if (rightLen > leftLen * 1.2) return 'right';
    return 'left';
  }

  // For numbers, prefer non-zero
  if (type === 'number') {
    if (Number(leftVal) === 0 && Number(rightVal) !== 0) return 'right';
    return 'left';
  }

  return 'left';
}

function valuesAreDifferent(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return false;
  return String(a) !== String(b);
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  const s = String(val);
  return s.length > 120 ? s.slice(0, 120) + '...' : s;
}

export function SideBySideComparison({
  entityType,
  leftData,
  rightData,
  leftLabel = 'Record A',
  rightLabel = 'Record B',
  leftId,
  rightId,
  onMerge,
  onKeepLeft,
  onKeepRight,
  onCancel,
  showActions = true,
}: SideBySideComparisonProps) {
  const fields = useMemo(() => getFieldsForEntity(entityType, { ...leftData, ...rightData }), [entityType, leftData, rightData]);

  const [choices, setChoices] = useState<Record<string, FieldChoice>>(() => {
    const initial: Record<string, FieldChoice> = {};
    for (const field of fields) {
      initial[field.key] = pickBetterValue(leftData[field.key], rightData[field.key], field.type);
    }
    return initial;
  });

  const diffFields = useMemo(
    () => fields.filter(f => valuesAreDifferent(leftData[f.key], rightData[f.key])),
    [fields, leftData, rightData]
  );

  const handleChoice = (key: string, value: FieldChoice) => {
    setChoices(prev => ({ ...prev, [key]: value }));
  };

  const buildMergedData = (): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};
    for (const field of fields) {
      merged[field.key] = choices[field.key] === 'left' ? leftData[field.key] : rightData[field.key];
    }
    return merged;
  };

  const handleMerge = () => {
    if (!onMerge || !leftId || !rightId) return;
    // Keep left by default, remove right
    onMerge(buildMergedData(), leftId, rightId);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Merge style={{ width: 16, height: 16 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Side-by-Side Comparison
          </Typography>
          <Badge variant="secondary">{diffFields.length} differences</Badge>
        </Box>
      </Box>

      {/* Comparison Table */}
      <Card>
        <CardContent>
          {/* Column Headers */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr 40px 1fr',
            gap: 0,
            borderBottom: '2px solid var(--border)',
            bgcolor: 'var(--muted)',
          }}>
            <Box sx={{ p: 1.5, fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
              Field
            </Box>
            <Box sx={{ p: 1.5, fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: '#3b82f6' }}>
              {leftLabel}
            </Box>
            <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight style={{ width: 14, height: 14, color: 'var(--muted-foreground)' }} />
            </Box>
            <Box sx={{ p: 1.5, fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: brandColors.main }}>
              {rightLabel}
            </Box>
          </Box>

          {/* Rows */}
          {fields.map((field, i) => {
            const leftVal = leftData[field.key];
            const rightVal = rightData[field.key];
            const isDiff = valuesAreDifferent(leftVal, rightVal);

            return (
              <Box
                key={field.key}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 40px 1fr',
                  gap: 0,
                  borderBottom: i < fields.length - 1 ? '1px solid var(--border)' : 'none',
                  bgcolor: isDiff ? 'rgba(250, 204, 21, 0.06)' : 'transparent',
                  '&:hover': { bgcolor: isDiff ? 'rgba(250, 204, 21, 0.1)' : 'var(--muted)' },
                }}
              >
                {/* Field Name */}
                <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '0.7rem' }}>
                    {field.label}
                  </Typography>
                </Box>

                {/* Left Value */}
                <Box
                  sx={{
                    p: 1.5,
                    cursor: isDiff ? 'pointer' : 'default',
                    borderLeft: choices[field.key] === 'left' && isDiff ? '3px solid #3b82f6' : '3px solid transparent',
                    bgcolor: choices[field.key] === 'left' && isDiff ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
                  }}
                  onClick={() => isDiff && handleChoice(field.key, 'left')}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', wordBreak: 'break-word' }}>
                    {formatCellValue(leftVal)}
                  </Typography>
                </Box>

                {/* Selection Indicator */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isDiff && (
                    <Box
                      sx={{
                        width: 20, height: 20, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: choices[field.key] === 'left' ? '#3b82f6' : brandColors.main,
                        color: 'white', fontSize: '0.6rem', fontWeight: 700,
                      }}
                    >
                      {choices[field.key] === 'left' ? 'L' : 'R'}
                    </Box>
                  )}
                </Box>

                {/* Right Value */}
                <Box
                  sx={{
                    p: 1.5,
                    cursor: isDiff ? 'pointer' : 'default',
                    borderLeft: choices[field.key] === 'right' && isDiff ? `3px solid ${brandColors.main}` : '3px solid transparent',
                    bgcolor: choices[field.key] === 'right' && isDiff ? brandColors.main + '0F' : 'transparent',
                  }}
                  onClick={() => isDiff && handleChoice(field.key, 'right')}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', wordBreak: 'break-word' }}>
                    {formatCellValue(rightVal)}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* Actions */}
      {showActions && (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {onKeepLeft && (
            <Button variant="outline" onClick={onKeepLeft} style={{ display: 'flex', gap: 6 }}>
              <Check style={{ width: 14, height: 14 }} />
              Keep {leftLabel}
            </Button>
          )}
          {onKeepRight && (
            <Button variant="outline" onClick={onKeepRight} style={{ display: 'flex', gap: 6 }}>
              <Check style={{ width: 14, height: 14 }} />
              Keep {rightLabel}
            </Button>
          )}
          {onMerge && leftId && rightId && (
            <Button onClick={handleMerge} style={{ display: 'flex', gap: 6, backgroundColor: '#3b82f6', color: 'white' }}>
              <Merge style={{ width: 14, height: 14 }} />
              Merge & Keep Best
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
