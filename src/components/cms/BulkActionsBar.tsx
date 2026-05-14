/**
 * BulkActionsBar — cross-type bulk publish/archive/unpublish/translate.
 * Operates on a list of `(content_type, id)` selections and writes through
 * `cms_content_metadata`. Translate enqueues `content_actions` entries; the
 * `workflow-dispatcher` edge function fans out to `cms-ai`.
 */

import { useState, useCallback } from 'react';
import { CheckCheck, Archive, EyeOff, Languages, ChevronDown, X, Loader2 } from 'lucide-react';
import { upsertCMSContentMetadata, insertContentActions } from '@/hooks/useCMSContentMetadata';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/i18n/languages';
import type { SupportedLocale } from '@/i18n/languages';
import type { WorkflowState } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const updateState = useCallback(
    async (state: WorkflowState) => {
      setBusy(true);
      setError(null);
      setProgress(`Updating ${selections.length} item${selections.length === 1 ? '' : 's'}…`);
      let ok = 0;
      for (const sel of selections) {
        const { error: e } = await upsertCMSContentMetadata(sel.tableName, sel.id, {
          workflow_state: state,
          last_edited_at: new Date().toISOString(),
        });
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
      setProgress(
        `Queuing ${selections.length} translation job${selections.length === 1 ? '' : 's'}…`,
      );
      const rows = selections.map((sel) => ({
        op: 'translate' as const,
        content_type: sel.contentType,
        table_name: sel.tableName,
        record_id: sel.id,
        target_locale: locale,
        status: 'pending' as const,
      }));
      const { error: e } = await insertContentActions(rows);
      setBusy(false);
      setProgress(null);
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
    <div className="sticky bottom-4 z-[5] mx-auto max-w-[720px] bg-background border border-primary rounded-lg shadow-lg p-3 flex items-center gap-3 flex-wrap">
      <p className="text-sm font-semibold">{selections.length} selected</p>
      <div className="flex-1 min-w-0">
        {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => updateState('published')}
        className="bg-green-600 hover:bg-green-700 text-white normal-case font-semibold"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
        ) : (
          <CheckCheck size={14} className="mr-1" />
        )}
        Publish
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => updateState('draft')}
        className="normal-case font-semibold"
      >
        <EyeOff size={14} className="mr-1" />
        Unpublish
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => updateState('archived')}
        className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 normal-case font-semibold"
      >
        <Archive size={14} className="mr-1" />
        Archive
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="normal-case font-semibold"
          >
            <Languages size={14} className="mr-1" />
            Translate
            <ChevronDown size={12} className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {nonDefaultLocales.map((loc) => (
            <DropdownMenuItem key={loc} onClick={() => enqueueTranslate(loc)}>
              Translate to {loc.toUpperCase()}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        className="normal-case text-muted-foreground"
      >
        <X size={14} className="mr-1" />
        Clear
      </Button>
      {error && (
        <Alert variant="destructive" className="w-full mt-2">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 underline text-xs"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
