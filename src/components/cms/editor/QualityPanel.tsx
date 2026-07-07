/**
 * QualityPanel — proactive AI quality review inside the editor.
 * In cockpit mode it auto-runs `cms-ai` quality_review on open and surfaces a
 * score + ranked issues, each with Jump (focus the owning field group) and Fix
 * (apply the validated drop-in suggestion). One "Apply all safe fixes" button.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, Loader2, RotateCcw, Check, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getContentType } from '@/config/contentTypeRegistry';
import { applyAIResult, applySuggestion } from '@/lib/cms/applyAIResult';
import type { QualityReviewOutput } from '@/lib/cms/applyAIResult';

interface QualityPanelProps {
  contentType: string;
  recordId: string | null;
  source: Record<string, unknown>;
  onApplyField: (field: string, value: unknown) => void;
  onJumpToField: (field: string) => void;
  /** Auto-run quality_review when the record opens (cockpit mode). */
  autoRun?: boolean;
}

/** Severity → monochrome foreground opacity (design system: no chromatic status). */
const SEVERITY_OPACITY: Record<string, number> = { high: 1, medium: 0.55, low: 0.3 };

export function QualityPanel({
  contentType,
  recordId,
  source,
  onApplyField,
  onJumpToField,
  autoRun,
}: QualityPanelProps) {
  const config = getContentType(contentType);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QualityReviewOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState<Set<string>>(new Set());
  // Latest source without retriggering the auto-run effect on every keystroke.
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const run = useCallback(async () => {
    if (!config || !recordId || recordId === 'new') return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('cms-ai', {
        body: {
          op: 'quality_review',
          content_type: config.id,
          record_id: recordId,
          source: sourceRef.current,
        },
      });
      if (err) throw err;
      if (!data?.ok) throw new Error(data?.error ?? 'Quality review failed');
      setResult(data.output as QualityReviewOutput);
      setFixed(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quality review failed');
    } finally {
      setLoading(false);
    }
  }, [config, recordId]);

  // Auto-run once per record in cockpit mode.
  const lastRun = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRun || !recordId || recordId === 'new') return;
    if (lastRun.current === recordId) return;
    lastRun.current = recordId;
    setResult(null);
    run();
  }, [autoRun, recordId, run]);

  const suggestionFor = useCallback(
    (field: string) => result?.suggestions?.find((s) => s.field === field),
    [result],
  );

  const handleFix = useCallback(
    (field: string, value: unknown) => {
      if (!config) return;
      if (applySuggestion(config, field, value, onApplyField)) {
        setFixed((prev) => new Set(prev).add(field));
      } else {
        setError(`Couldn't apply fix for "${field}" (not writable or invalid).`);
      }
    },
    [config, onApplyField],
  );

  const handleApplyAll = useCallback(() => {
    if (!config || !result) return;
    const res = applyAIResult(config, 'quality_review', result, onApplyField);
    if (res.error) {
      setError(res.error);
    } else {
      setFixed((prev) => {
        const next = new Set(prev);
        res.fields.forEach((f) => next.add(f));
        return next;
      });
    }
  }, [config, result, onApplyField]);

  if (!recordId || recordId === 'new') {
    return <p className="text-sm text-muted-foreground">Save the item first to run a quality review.</p>;
  }

  const score = result?.quality_score;
  const issues = result?.issues ?? [];
  const hasSuggestions = (result?.suggestions?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Score + run control */}
      <div className="flex items-center gap-2">
        {typeof score === 'number' ? (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-2xl font-bold tabular-nums">{score}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
            <div className="relative h-1.5 flex-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-1.5 transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, score))}%`,
                  backgroundColor:
                    score >= 80
                      ? 'hsl(var(--foreground))'
                      : score >= 50
                        ? 'hsl(var(--foreground) / 0.55)'
                        : 'hsl(var(--destructive))',
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground flex-1">
            {loading ? 'Reviewing…' : 'Not reviewed yet.'}
          </p>
        )}
        <Button
          size="sm"
          variant={result ? 'outline' : 'default'}
          disabled={loading}
          onClick={run}
          className="text-xs font-semibold gap-1 shrink-0"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : result ? (
            <RotateCcw size={12} />
          ) : (
            <Gauge size={12} />
          )}
          {loading ? 'Running…' : result ? 'Re-run' : 'Review'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Apply all */}
      {hasSuggestions && (
        <Button
          size="sm"
          onClick={handleApplyAll}
          className="text-xs font-semibold gap-1 self-start"
        >
          <Check size={12} />
          Apply all safe fixes
        </Button>
      )}

      {/* Issues */}
      {result && issues.length === 0 && (
        <p className="text-sm text-muted-foreground">No issues flagged.</p>
      )}
      {issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {issues.map((issue, i) => {
            const sug = suggestionFor(issue.field);
            const isFixed = fixed.has(issue.field);
            return (
              <div
                key={`${issue.field}-${i}`}
                className="border border-border rounded-element p-2 flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: `hsl(var(--foreground) / ${SEVERITY_OPACITY[issue.severity] ?? 0.55})`,
                    }}
                    aria-label={issue.severity}
                  />
                  <button
                    type="button"
                    onClick={() => onJumpToField(issue.field)}
                    className="text-xs font-semibold hover:underline flex items-center gap-0.5"
                  >
                    <CornerDownRight size={11} className="text-muted-foreground" />
                    {issue.field}
                  </button>
                  {isFixed && (
                    <Badge variant="secondary" className="ml-auto h-[18px] text-2xs">
                      fixed
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{issue.message}</p>
                {sug && !isFixed && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleFix(sug.field, sug.value)}
                    className="text-xs font-semibold gap-1 self-start h-7"
                  >
                    <Check size={11} />
                    Fix
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
