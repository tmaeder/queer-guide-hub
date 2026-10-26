/**
 * EditorHeader - Top bar for the CMS editor.
 */

import { useState, useCallback } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import {
  X,
  RotateCcw,
  Eye,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  FileText,
  SquareArrowOutUpRight,
} from '@/components/icons';
import type { ContentTypeConfig, EditorState } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CannedResponsePicker } from '@/components/admin/triage/CannedResponsePicker';
import { AdminToolsPopover } from '@/components/admin/primitives/AdminToolsPopover';
import { SaveButton } from './SaveButton';
import { PreviewPanel } from './PreviewPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { livePath as resolveLivePath } from '@/lib/cmsLinks';
import { useCurrentLocale } from '@/hooks/useLocalizedNavigate';
import { DEFAULT_LOCALE } from '@/i18n/languages';

interface EditorHeaderProps {
  contentType: ContentTypeConfig;
  state: EditorState;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
  onEnrich?: () => void;
  isEnriching?: boolean;
  /** Cockpit mode: position in the review queue (0-based). */
  queueInfo?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  onApprove?: () => void;
  onRequestChanges?: (reason: string) => void;
  isTransitioning?: boolean;
}

export function EditorHeader({
  contentType,
  state,
  onSave,
  onReset,
  onClose,
  onEnrich,
  isEnriching,
  queueInfo,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onApprove,
  onRequestChanges,
  isTransitioning,
}: EditorHeaderProps) {
  const Icon = contentType.icon;
  const titleValue = (state.data[contentType.titleField] as string) ?? '';
  const displayTitle =
    titleValue || (state.itemId ? 'Untitled' : `New ${contentType.label.singular}`);

  const [previewOpen, setPreviewOpen] = useState(false);

  // The admin shell has no locale segment, so this is the default locale —
  // which is the right place to land when checking a record's live page.
  const locale = useCurrentLocale();
  const basePath = resolveLivePath(contentType.id, state.data);
  const livePath = basePath ? `${locale === DEFAULT_LOCALE ? '' : `/${locale}`}${basePath}` : null;

  // Request-changes reasons popover (cockpit mode)
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const submitRequestChanges = useCallback(() => {
    if (!reason.trim() || !onRequestChanges) return;
    onRequestChanges(reason.trim());
    setReason('');
    setReasonOpen(false);
  }, [reason, onRequestChanges]);

  const handleClose = () => {
    if (state.isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmed) return;
    }
    onClose();
  };

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const saveShortcut = isMac ? '⌘S' : 'Ctrl+S';

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-t-container px-4 py-4 bg-card flex-shrink-0">
      {/* Left side */}
      <div className="flex flex-wrap items-center gap-4 min-w-0 basis-full lg:basis-auto flex-1">
        <div
          className="flex items-center justify-center flex-shrink-0 rounded-element w-10 h-10"
          style={{ backgroundColor: contentType.color + '18', color: contentType.color }}
        >
          <Icon style={{ width: 20, height: 20 }} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground leading-tight">
            {contentType.label.singular}
          </p>

          <h1
            className="truncate font-sans text-title font-semibold text-foreground"
            title={displayTitle}
          >
            {displayTitle}
          </h1>
        </div>

        {queueInfo && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous in queue"
              className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft size={18} />
            </Button>
            <span className="text-13 font-semibold tabular-nums text-muted-foreground min-w-[52px] text-center">
              {queueInfo.index + 1} / {queueInfo.total}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next in queue"
              className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight size={18} />
            </Button>
          </div>
        )}

        {state.isDirty && !state.isSaving && (
          <Badge
            role="status"
            className="text-xs font-medium h-6 flex-shrink-0"
            style={{
              backgroundColor: 'hsl(var(--muted))',
              color: 'hsl(var(--foreground))',
            }}
          >
            Unsaved changes
          </Badge>
        )}

        {state.isSaving && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <TrackLoader size={16} label="Loading" />
            <p className="text-xs text-muted-foreground font-medium">Saving...</p>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <TooltipProvider>
          {queueInfo && onApprove && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    disabled={isTransitioning || state.isSaving}
                    onClick={onApprove}
                    className="font-semibold normal-case bg-foreground hover:bg-foreground text-background"
                  >
                    {isTransitioning ? (
                      <TrackLoader size={16} className="mr-1" />
                    ) : (
                      <ThumbsUp className="h-4 w-4 mr-1" />
                    )}
                    Approve
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Publish &amp; advance ({isMac ? '⌘↵' : 'Ctrl+↵'})</TooltipContent>
              </Tooltip>

              <Popover open={reasonOpen} onOpenChange={setReasonOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isTransitioning || state.isSaving}
                    className="border font-medium normal-case border-destructive text-destructive hover:bg-destructive/10"
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" />
                    Request changes
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-4 flex flex-col gap-2">
                  <p className="text-sm font-semibold">Send back to draft</p>
                  <CannedResponsePicker
                    value=""
                    onSelect={(_slug, template) => setReason(template)}
                  />
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for requesting changes…"
                    rows={3}
                    className="text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReasonOpen(false)}
                      className="font-medium normal-case"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!reason.trim() || isTransitioning}
                      onClick={submitRequestChanges}
                      className="font-semibold normal-case"
                    >
                      Send back
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="hidden sm:block w-px h-6 bg-border mx-1" />
            </>
          )}

          <AdminToolsPopover label="Editor tools">
            {onEnrich && state.itemId && (
              <Button
                variant="outline"
                size="sm"
                disabled={isEnriching || state.isSaving}
                onClick={onEnrich}
                className="inline-flex font-medium normal-case text-foreground"
                style={{ borderColor: 'hsl(var(--foreground))' }}
              >
                {isEnriching ? (
                  <TrackLoader size={16} className="mr-1" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                {isEnriching ? 'Enriching...' : 'Enrich'}
              </Button>
            )}

            {contentType.id === 'personalities' && state.itemId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/admin/content/personalities/${state.itemId}/datasheet?print=1`,
                    '_blank',
                    'noopener',
                  )
                }
                className="inline-flex font-medium normal-case text-muted-foreground"
              >
                <FileText className="h-4 w-4 mr-1" />
                Datenblatt
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex font-medium normal-case text-muted-foreground"
            >
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>

            {/* The other half of the switcher. Preview iframes the page inside
              the editor; this leaves for the real thing. Hidden rather than
              disabled when there is no public page — a type with no page at
              all (a vocabulary term) and an unsaved row are both "nothing to
              go to", and a permanently greyed button explains neither. */}
            {livePath && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(livePath, '_blank', 'noopener')}
                className="inline-flex font-medium normal-case text-muted-foreground"
              >
                <SquareArrowOutUpRight className="h-4 w-4 mr-1" />
                View live
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={!state.isDirty || state.isSaving}
              onClick={onReset}
              className="inline-flex font-medium normal-case"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </AdminToolsPopover>

          <SaveButton
            isDirty={state.isDirty}
            isSaving={state.isSaving}
            hasError={Boolean(state.errors?._save || state.errors?._conflict)}
            onSave={onSave}
            shortcutLabel={saveShortcut}
          />

          <div className="hidden sm:block w-px h-6 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Close editor"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close editor</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Live preview — real public route in an iframe */}
      <PreviewPanel
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        contentType={contentType}
        row={state.data}
        isSaving={state.isSaving}
      />
    </div>
  );
}
