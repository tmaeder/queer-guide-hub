import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ArrowRight, Merge } from 'lucide-react';
import { getFieldsForEntity, type FieldDef } from './StructuredFieldDisplay';

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
    onMerge(buildMergedData(), leftId, rightId);
  };

  const gridCols = { gridTemplateColumns: '140px 1fr 40px 1fr' };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Merge style={{ width: 16, height: 16 }} />
          <h6 className="text-sm font-semibold">Side-by-Side Comparison</h6>
          <Badge variant="secondary">{diffFields.length} differences</Badge>
        </div>
      </div>

      {/* Comparison Table */}
      <Card>
        <CardContent>
          {/* Column Headers */}
          <div className="grid border-b-2 border-border bg-muted" style={gridCols}>
            <div className="p-3 font-semibold text-xs uppercase text-muted-foreground">Field</div>
            <div className="p-3 font-semibold text-xs uppercase" style={{ color: 'hsl(var(--muted-foreground))' }}>{leftLabel}</div>
            <div className="p-3 flex items-center justify-center">
              <ArrowRight style={{ width: 14, height: 14 }} className="text-muted-foreground" />
            </div>
            <div className="p-3 font-semibold text-xs uppercase" style={{ color: 'hsl(var(--foreground))' }}>{rightLabel}</div>
          </div>

          {/* Rows */}
          {fields.map((field, i) => {
            const leftVal = leftData[field.key];
            const rightVal = rightData[field.key];
            const isDiff = valuesAreDifferent(leftVal, rightVal);

            return (
              <div
                key={field.key}
                className={`grid ${i < fields.length - 1 ? 'border-b border-border' : ''} ${isDiff ? 'hover:bg-yellow-100/10' : 'hover:bg-muted'}`}
                style={{ ...gridCols, backgroundColor: isDiff ? 'rgba(250, 204, 21, 0.06)' : 'transparent' }}
              >
                {/* Field Name */}
                <div className="p-3 flex items-center">
                  <span className="text-xs font-semibold text-muted-foreground" style={{ fontSize: '0.7rem' }}>
                    {field.label}
                  </span>
                </div>

                {/* Left Value */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- role/tabIndex conditionally applied when isDiff */}
                <div
                  className="p-3"
                  style={{
                    cursor: isDiff ? 'pointer' : 'default',
                    borderLeft: choices[field.key] === 'left' && isDiff ? '3px solid hsl(var(--muted-foreground))' : '3px solid transparent',
                    backgroundColor: choices[field.key] === 'left' && isDiff ? 'hsl(var(--muted))' : 'transparent',
                  }}
                  onClick={() => isDiff && handleChoice(field.key, 'left')}
                  onKeyDown={
                    isDiff
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleChoice(field.key, 'left');
                          }
                        }
                      : undefined
                  }
                  role={isDiff ? 'button' : undefined}
                  tabIndex={isDiff ? 0 : undefined}
                  aria-pressed={isDiff ? choices[field.key] === 'left' : undefined}
                >
                  <p className="text-sm break-words" style={{ fontSize: '0.8rem' }}>{formatCellValue(leftVal)}</p>
                </div>

                {/* Selection Indicator */}
                <div className="flex items-center justify-center">
                  {isDiff && (
                    <div
                      className="flex items-center justify-center text-white font-bold"
                      style={{
                        width: 20, height: 20, borderRadius: '50%',
                        backgroundColor: choices[field.key] === 'left' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                        fontSize: '0.6rem',
                      }}
                    >
                      {choices[field.key] === 'left' ? 'L' : 'R'}
                    </div>
                  )}
                </div>

                {/* Right Value */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- role/tabIndex conditionally applied when isDiff */}
                <div
                  className="p-3"
                  style={{
                    cursor: isDiff ? 'pointer' : 'default',
                    borderLeft: choices[field.key] === 'right' && isDiff ? `3px solid ${'hsl(var(--foreground))'}` : '3px solid transparent',
                    backgroundColor: choices[field.key] === 'right' && isDiff ? 'hsl(var(--muted))' : 'transparent',
                  }}
                  onClick={() => isDiff && handleChoice(field.key, 'right')}
                  onKeyDown={
                    isDiff
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleChoice(field.key, 'right');
                          }
                        }
                      : undefined
                  }
                  role={isDiff ? 'button' : undefined}
                  tabIndex={isDiff ? 0 : undefined}
                  aria-pressed={isDiff ? choices[field.key] === 'right' : undefined}
                >
                  <p className="text-sm break-words" style={{ fontSize: '0.8rem' }}>{formatCellValue(rightVal)}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Actions */}
      {showActions && (
        <div className="flex gap-2 justify-end flex-wrap">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
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
            <Button onClick={handleMerge} style={{ display: 'flex', gap: 6, backgroundColor: 'hsl(var(--muted-foreground))', color: 'white' }}>
              <Merge style={{ width: 14, height: 14 }} />
              Merge & Keep Best
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
