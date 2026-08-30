/**
 * BulkActionsBar — cross-type bulk publish/archive/unpublish/translate.
 * Operates on a list of `(content_type, id)` selections and writes through
 * `cms_content_metadata`. Translate enqueues `content_actions` entries; the
 * `workflow-dispatcher` edge function fans out to `cms-ai`.
 *
 * ARCHIVE IS THE EXCEPTION and does not go through that sidecar alone.
 * `cms_content_metadata.workflow_state` is a table no public query reads and
 * the list itself does not join, so bulk-archiving fifty venues used to change
 * nothing at all — they stayed public, stayed in search, and stayed "Published"
 * in this very list. When the type declares `lifecycle.archive`, Archive calls
 * `archive_entity` per row, which holds the real per-type semantics.
 *
 * When the type declares a `lifecycle` with NO `archive`, the button is hidden
 * rather than left writing the sidecar: countries have no archivable state, and
 * a button that appears to work is worse than one that is absent.
 */

import { useState, useCallback } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { CheckCheck, Archive, EyeOff, Languages, ChevronDown, X} from 'lucide-react';
import { upsertCMSContentMetadata, insertContentActions } from '@/hooks/useCMSContentMetadata';
import { useBulkColumnEdit } from '@/hooks/useBulkColumnEdit';
import type { ContentBulkEditField, ContentLifecycleConfig } from '@/types/cms';
import { untypedRpc } from '@/integrations/supabase/untyped';
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
  /**
   * Columns the current type allows editing across selected rows. Unlike the
   * workflow buttons — which write cms_content_metadata — these write the
   * entity table itself.
   */
  bulkEditFields?: ContentBulkEditField[];
  /**
   * The selected type's lifecycle capability. Absent for types that predate the
   * registry block, which keep the legacy sidecar-only Archive.
   */
  lifecycle?: ContentLifecycleConfig;
}

export function BulkActionsBar({
  selections,
  onClear,
  onComplete,
  bulkEditFields,
  lifecycle,
}: BulkActionsBarProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const bulkColumnEdit = useBulkColumnEdit();

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

  /**
   * Bulk archive through `archive_entity`, one call per row.
   *
   * Deliberately NOT a single `.in()` update like applyBulkEdit below: the
   * per-type semantics differ (a city becomes a ghost, an event is cancelled, a
   * hotel gets an archived_at) and several branches record a prior-state
   * snapshot their restore counterpart reads back. A bulk column write would
   * set the column and skip the snapshot, producing rows that archive but
   * cannot be restored.
   *
   * Failures are reported with a count AND the first reason. An aggregate
   * "3 failed" tells an operator nothing actionable, and these RPCs refuse with
   * specific messages worth surfacing.
   */
  const bulkArchive = useCallback(async () => {
    if (!lifecycle?.archive) return;
    setBusy(true);
    setError(null);
    let ok = 0;
    let firstError: string | null = null;

    for (const [i, sel] of selections.entries()) {
      setProgress(`Archiving ${i + 1} of ${selections.length}…`);
      const { error: e } = await untypedRpc('archive_entity', {
        p_type: lifecycle.type,
        p_id: sel.id,
        p_reason: 'bulk archive',
      });
      if (e) firstError ??= e.message;
      else ok++;
    }

    setBusy(false);
    setProgress(null);
    if (ok < selections.length) {
      setError(`${selections.length - ok} of ${selections.length} failed. ${firstError ?? ''}`);
      // Still refresh: the ones that succeeded really are archived, and leaving
      // the list stale would misreport them as live.
      onComplete?.();
    } else {
      onComplete?.();
      onClear();
    }
  }, [lifecycle, selections, onClear, onComplete]);

  /**
   * Writes one column across every selected row.
   *
   * Single `.in()` update rather than a per-row loop: this is one statement on
   * one table, and each entity write costs a search-index sync on this
   * instance, so a loop would multiply that by the selection size.
   */
  const applyBulkEdit = useCallback(
    async (column: string, value: unknown, label: string) => {
      const table = selections[0]?.tableName;
      if (!table) return;
      setBusy(true);
      setError(null);
      setProgress(`Setting ${label} on ${selections.length} item(s)…`);

      const { error: e } = await bulkColumnEdit(
        table,
        selections.map((s) => s.id),
        column,
        value,
      );

      setBusy(false);
      setProgress(null);
      if (e) {
        setError(e);
      } else {
        onComplete?.();
        onClear();
      }
    },
    [selections, onClear, onComplete, bulkColumnEdit],
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
    <div className="sticky bottom-4 z-[5] mx-auto max-w-[720px] bg-background border border-primary rounded-element p-4 flex items-center gap-4 flex-wrap">
      <p className="text-sm font-semibold">{selections.length} selected</p>
      <div className="flex-1 min-w-0">
        {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
      </div>
      {(bulkEditFields ?? []).map((f) => (
        <DropdownMenu key={f.name}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy} className="normal-case font-semibold">
              {f.label}
              <ChevronDown size={14} className="ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {f.type === 'boolean' ? (
              [
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
              ].map((o) => (
                <DropdownMenuItem
                  key={String(o.value)}
                  onClick={() => void applyBulkEdit(f.name, o.value, `${f.label} → ${o.label}`)}
                >
                  {o.label}
                </DropdownMenuItem>
              ))
            ) : (
              (f.options ?? []).map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  onClick={() => void applyBulkEdit(f.name, o.value, `${f.label} → ${o.label}`)}
                >
                  {o.label}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}

      <Button
        size="sm"
        disabled={busy}
        onClick={() => updateState('published')}
        className="bg-foreground hover:bg-foreground text-background normal-case font-semibold"
      >
        {busy ? (
          <TrackLoader size={14} className="mr-1" />
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
      {/* Hidden when the type declares a lifecycle with no archivable state
          (countries). Shown for a type with no lifecycle block at all, where
          the legacy sidecar write is still all there is. */}
      {(!lifecycle || lifecycle.archive) && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => (lifecycle?.archive ? void bulkArchive() : void updateState('archived'))}
          className="border-border text-foreground hover:bg-muted normal-case font-semibold"
        >
          <Archive size={14} className="mr-1" />
          Archive
        </Button>
      )}
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
