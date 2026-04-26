/**
 * BulkActionsBar — cross-type bulk publish/archive/unpublish/translate.
 * Operates on a list of `(content_type, id)` selections and writes through
 * `cms_content_metadata`. Translate enqueues `content_actions` entries; the
 * `workflow-dispatcher` edge function fans out to `cms-ai`.
 */

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import { CheckCheck, Archive, EyeOff, Languages, ChevronDown, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/i18n/languages';
import type { SupportedLocale } from '@/i18n/languages';
import type { WorkflowState } from '@/types/cms';

export interface BulkSelection {
  contentType: string;
  tableName: string;
  id: string;
}

interface BulkActionsBarProps {
  selections: BulkSelection[];
  onClear: () => void;
  onComplete?: () => void;
}

export function BulkActionsBar({ selections, onClear, onComplete }: BulkActionsBarProps) {
  const [busy, setBusy] = useState(false);
  const [translateAnchor, setTranslateAnchor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const updateState = useCallback(
    async (state: WorkflowState) => {
      setBusy(true);
      setError(null);
      setProgress(`Updating ${selections.length} item${selections.length === 1 ? '' : 's'}…`);
      let ok = 0;
      for (const sel of selections) {
        const { error: e } = await supabase
          .from('cms_content_metadata' as 'events')
          .upsert(
            {
              source_table: sel.tableName,
              source_id: sel.id,
              workflow_state: state,
              last_edited_at: new Date().toISOString(),
            } as never,
            { onConflict: 'source_table,source_id' },
          );
        if (!e) ok++;
      }
      setBusy(false);
      setProgress(null);
      if (ok < selections.length) {
        setError(`${selections.length - ok} item(s) failed.`);
      } else {
        onComplete?.();
        onClear();
      }
    },
    [selections, onClear, onComplete],
  );

  const enqueueTranslate = useCallback(
    async (locale: SupportedLocale) => {
      setBusy(true);
      setError(null);
      setProgress(`Queuing ${selections.length} translation job${selections.length === 1 ? '' : 's'}…`);
      const rows = selections.map((sel) => ({
        op: 'translate' as const,
        content_type: sel.contentType,
        table_name: sel.tableName,
        record_id: sel.id,
        target_locale: locale,
        status: 'pending' as const,
      }));
      const { error: e } = await supabase.from('content_actions' as 'events').insert(rows as never);
      setBusy(false);
      setProgress(null);
      setTranslateAnchor(null);
      if (e) {
        setError(`Failed to enqueue: ${e.message}`);
      } else {
        onComplete?.();
        onClear();
      }
    },
    [selections, onClear, onComplete],
  );

  if (selections.length === 0) return null;

  const nonDefaultLocales = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 16,
        zIndex: 5,
        mx: 'auto',
        maxWidth: 720,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'primary.main',
        borderRadius: 2,
        boxShadow: 3,
        p: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {selections.length} selected
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {progress && (
          <Typography variant="caption" color="text.secondary">
            {progress}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant="contained"
        color="success"
        disabled={busy}
        onClick={() => updateState('published')}
        startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCheck size={14} />}
        sx={{ textTransform: 'none', fontWeight: 600 }}
      >
        Publish
      </Button>
      <Button
        size="small"
        variant="outlined"
        disabled={busy}
        onClick={() => updateState('draft')}
        startIcon={<EyeOff size={14} />}
        sx={{ textTransform: 'none', fontWeight: 600 }}
      >
        Unpublish
      </Button>
      <Button
        size="small"
        variant="outlined"
        color="warning"
        disabled={busy}
        onClick={() => updateState('archived')}
        startIcon={<Archive size={14} />}
        sx={{ textTransform: 'none', fontWeight: 600 }}
      >
        Archive
      </Button>
      <Button
        size="small"
        variant="outlined"
        disabled={busy}
        onClick={(e) => setTranslateAnchor(e.currentTarget)}
        startIcon={<Languages size={14} />}
        endIcon={<ChevronDown size={12} />}
        sx={{ textTransform: 'none', fontWeight: 600 }}
      >
        Translate
      </Button>
      <Menu
        anchorEl={translateAnchor}
        open={Boolean(translateAnchor)}
        onClose={() => setTranslateAnchor(null)}
      >
        {nonDefaultLocales.map((loc) => (
          <MenuItem key={loc} onClick={() => enqueueTranslate(loc)}>
            Translate to {loc.toUpperCase()}
          </MenuItem>
        ))}
      </Menu>
      <Button
        size="small"
        variant="text"
        onClick={onClear}
        startIcon={<X size={14} />}
        sx={{ textTransform: 'none', color: 'text.secondary' }}
      >
        Clear
      </Button>
      {error && (
        <Alert severity="error" sx={{ width: '100%', mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
