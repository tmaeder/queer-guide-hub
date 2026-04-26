/**
 * AIAssistDrawer — editor-side panel that calls the `cms-ai` edge function.
 * Outputs are validated against the type's Zod schema before the editor
 * applies them via `onApply(field, value)`.
 */

import { useState, useCallback } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import { Sparkles, X, Check, RotateCcw, FileText, Image as ImageIcon, Tag, Search, Globe } from 'lucide-react';
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
        setResults((prev) => ({ ...prev, [op]: { op, output: data.output, cached: data.cached } }));
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
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', sm: 420 }, p: 2.5, height: '100%', overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Sparkles size={18} />
          <Typography variant="h6" sx={{ fontWeight: 700, ml: 1, flex: 1 }}>
            AI Assist
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close AI assistant">
            <X size={18} />
          </IconButton>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Output is validated against the {config.label.singular} schema before applying.
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {ops.map((op) => {
            const meta = OP_META[op];
            const Icon = meta.icon;
            const result = results[op];
            const busy = busyOp === op;
            return (
              <Box
                key={op}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 1.5,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  <Icon size={14} />
                  <Typography variant="body2" sx={{ fontWeight: 600, ml: 0.75 }}>
                    {meta.label}
                  </Typography>
                  {result?.cached && (
                    <Chip
                      label="cached"
                      size="small"
                      sx={{ ml: 1, height: 18, fontSize: '0.65rem' }}
                    />
                  )}
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 1 }}
                >
                  {meta.description}
                </Typography>
                {result && (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      mb: 1,
                      p: 1,
                      bgcolor: 'grey.50',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      fontSize: '0.75rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 160,
                      overflow: 'auto',
                    }}
                  >
                    {typeof result.output === 'string'
                      ? result.output
                      : JSON.stringify(result.output, null, 2)}
                  </Box>
                )}
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <Button
                    size="small"
                    variant={result ? 'outlined' : 'contained'}
                    disabled={busy}
                    onClick={() => run(op)}
                    startIcon={
                      busy ? (
                        <CircularProgress size={12} color="inherit" />
                      ) : result ? (
                        <RotateCcw size={12} />
                      ) : (
                        <Sparkles size={12} />
                      )
                    }
                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
                  >
                    {busy ? 'Running…' : result ? 'Re-run' : 'Run'}
                  </Button>
                  {result && (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={() => apply(op, result.output)}
                      startIcon={<Check size={12} />}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
                    >
                      Apply
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Drawer>
  );
}
