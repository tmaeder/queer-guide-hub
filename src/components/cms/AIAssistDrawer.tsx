/**
 * AIAssistDrawer — editor-side panel that calls the `cms-ai` edge function.
 * Outputs are validated against the type's Zod schema before the editor
 * applies them via `onApply(field, value)`.
 */

import { useState, useCallback } from 'react';
import {
  Sparkles,
  X,
  Check,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  Tag,
  Search,
  Globe,
  Loader2,
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { fieldToZod } from '@/lib/cms/zodFromFields';
import type { ContentTypeConfig, AIAssistOp } from '@/types/cms';

const OP_META: Record<
  AIAssistOp,
  { label: string; icon: typeof Sparkles; description: string; targetField?: string }
> = {
  summarize: {
    label: 'Summarize',
    icon: FileText,
    description: 'Generate a concise editorial summary.',
    targetField: 'excerpt',
  },
  alt_text: {
    label: 'Alt text',
    icon: ImageIcon,
    description: 'Generate accessibility alt text for the cover image.',
    targetField: 'image_alt',
  },
  seo_draft: {
    label: 'SEO draft',
    icon: Search,
    description: 'Draft meta_title and meta_description.',
  },
  auto_tag: {
    label: 'Auto-tag',
    icon: Tag,
    description: 'Suggest tags from existing taxonomy.',
  },
  fact_check: {
    label: 'Fact-check',
    icon: Globe,
    description: 'Flag potentially-stale or unverified claims.',
  },
  translate: {
    label: 'Translate',
    icon: Globe,
    description: 'Translate translatable fields to another locale.',
  },
};

interface AIAssistDrawerProps {
  open: boolean;
  onClose: () => void;
  config: ContentTypeConfig;
  recordId: string;
  source: Record<string, unknown>;
  onApply: (field: string, value: unknown) => void;
}

interface Result {
  op: AIAssistOp;
  output: unknown;
  cached?: boolean;
}

export function AIAssistDrawer({
  open,
  onClose,
  config,
  recordId,
  source,
  onApply,
}: AIAssistDrawerProps) {
  const [busyOp, setBusyOp] = useState<AIAssistOp | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [error, setError] = useState<string | null>(null);

  const ops = config.aiAssist?.ops ?? ['summarize', 'seo_draft', 'auto_tag'];

  const run = useCallback(
    async (op: AIAssistOp) => {
      setBusyOp(op);
      setError(null);
      try {
        const { data, error: err } = await supabase.functions.invoke('cms-ai', {
          body: {
            op,
            content_type: config.id,
            record_id: recordId,
            source,
          },
        });
        if (err) throw err;
        if (!data?.ok) throw new Error(data?.error ?? 'AI call failed');
        setResults((prev) => ({
          ...prev,
          [op]: { op, output: data.output, cached: data.cached },
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI call failed');
      } finally {
        setBusyOp(null);
      }
    },
    [config.id, recordId, source],
  );

  const apply = useCallback(
    (op: AIAssistOp, output: unknown) => {
      const writable = config.aiAssist?.writableFields ?? [];
      if (op === 'summarize') {
        const field = OP_META.summarize.targetField ?? 'excerpt';
        if (writable.length && !writable.includes(field)) {
          setError(`Field "${field}" is not in writableFields for this type.`);
          return;
        }
        const target = config.fields.find((f) => f.name === field);
        if (target) {
          const parsed = fieldToZod(target).safeParse(output);
          if (!parsed.success) {
            setError(`Validation failed for ${field}: ${parsed.error.message}`);
            return;
          }
        }
        onApply(field, output);
      } else if (op === 'alt_text') {
        const field = OP_META.alt_text.targetField ?? 'image_alt';
        onApply(field, output);
      } else if (op === 'seo_draft' && output && typeof output === 'object') {
        const o = output as { meta_title?: string; meta_description?: string };
        if (o.meta_title) onApply('meta_title', o.meta_title);
        if (o.meta_description) onApply('meta_description', o.meta_description);
      } else if (op === 'auto_tag' && output && typeof output === 'object') {
        const tags = (output as { tags?: string[] }).tags ?? [];
        onApply('tags', tags);
      }
    },
    [config, onApply],
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-5 overflow-auto">
        <div className="flex items-center mb-4">
          <Sparkles size={18} />
          <h6 className="text-lg font-bold ml-2 flex-1">AI Assist</h6>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close AI assistant"
            className="h-7 w-7 p-0"
          >
            <X size={18} />
          </Button>
        </div>
        <p className="block text-xs text-muted-foreground mb-4">
          Output is validated against the {config.label.singular} schema before applying.
        </p>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="flex items-start gap-2">
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss"
                className="ml-2"
              >
                <X size={14} />
              </button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          {ops.map((op) => {
            const meta = OP_META[op];
            const Icon = meta.icon;
            const result = results[op];
            const busy = busyOp === op;
            return (
              <div
                key={op}
                className="border border-border rounded-element p-3 bg-background"
              >
                <div className="flex items-center mb-1">
                  <Icon size={14} />
                  <span className="text-sm font-semibold ml-2">{meta.label}</span>
                  {result?.cached && (
                    <Badge variant="secondary" className="ml-2 h-[18px] text-[0.65rem]">
                      cached
                    </Badge>
                  )}
                </div>
                <p className="block text-xs text-muted-foreground mb-2">{meta.description}</p>
                {result && (
                  <pre className="m-0 mb-2 p-2 bg-gray-50 border border-border rounded text-xs whitespace-pre-wrap break-words max-h-40 overflow-auto">
                    {typeof result.output === 'string'
                      ? result.output
                      : JSON.stringify(result.output, null, 2)}
                  </pre>
                )}
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={result ? 'outline' : 'default'}
                    disabled={busy}
                    onClick={() => run(op)}
                    className="text-xs font-semibold gap-1"
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : result ? (
                      <RotateCcw size={12} />
                    ) : (
                      <Sparkles size={12} />
                    )}
                    {busy ? 'Running…' : result ? 'Re-run' : 'Run'}
                  </Button>
                  {result && (
                    <Button
                      size="sm"
                      onClick={() => apply(op, result.output)}
                      className="text-xs font-semibold gap-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check size={12} />
                      Apply
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
