/**
 * EditorHeader - Top bar for the CMS editor.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Eye,
  Pencil,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  FileText,
} from 'lucide-react';
import type { ContentTypeConfig, EditorState } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CannedResponsePicker } from '@/components/admin/triage/CannedResponsePicker';
import { SaveButton } from './SaveButton';
import { PreviewPanel } from './PreviewPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(titleValue);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  // Request-changes reasons popover (cockpit mode)
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const submitRequestChanges = useCallback(() => {
    if (!reason.trim() || !onRequestChanges) return;
    onRequestChanges(reason.trim());
    setReason('');
    setReasonOpen(false);
  }, [reason, onRequestChanges]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (!isEditingTitle) setEditTitleValue(titleValue);
  }, [titleValue, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleStartEditing = useCallback(() => {
    setEditTitleValue(titleValue);
    setIsEditingTitle(true);
  }, [titleValue]);

  const handleFinishEditing = useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleFinishEditing();
      if (e.key === 'Escape') {
        setEditTitleValue(titleValue);
        setIsEditingTitle(false);
      }
    },
    [handleFinishEditing, titleValue],
  );

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
    <div className="flex items-center justify-between px-4 py-4 border-b border-border bg-background flex-shrink-0 min-h-[56px]">
      {/* Left side */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div
          className="flex items-center justify-center flex-shrink-0 rounded-element w-10 h-10"
          style={{ backgroundColor: contentType.color + '18', color: contentType.color }}
        >
          <Icon style={{ width: 20, height: 20 }} />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-semibold uppercase leading-tight"
            style={{ color: contentType.color, letterSpacing: '0.5px' }}
          >
            {contentType.label.singular}
          </p>

          {isEditingTitle ? (
            <Input
              ref={titleInputRef}
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onBlur={handleFinishEditing}
              onKeyDown={handleTitleKeyDown}
              className="h-7 px-0 border-0 border-b border-primary rounded-none text-base font-semibold focus-visible:ring-0"
            />
          ) : (
            <div
              onClick={handleStartEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleStartEditing();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Edit title"
              className="group flex items-center gap-1.5 cursor-pointer border-b border-dashed border-transparent hover:border-muted-foreground/40 rounded-badge transition-colors"
            >
              <p
                className={cn(
                  'font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-[350px] md:max-w-[500px] leading-snug',
                  titleValue ? 'text-foreground' : 'text-muted-foreground/60',
                )}
              >
                {displayTitle}
              </p>
              <Pencil
                size={13}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              />
            </div>
          )}
        </div>

        {queueInfo && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous in queue"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
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
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight size={18} />
            </Button>
          </div>
        )}

        {state.isDirty && !state.isSaving && (
          <Badge
            className="text-xs font-medium h-6 flex-shrink-0 opacity-90"
            style={{
              backgroundColor: 'hsl(var(--warning, 38 92% 50%))',
              color: 'white',
            }}
          >
            Unsaved changes
          </Badge>
        )}

        {state.isSaving && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading" />
            <p className="text-xs text-muted-foreground font-medium">Saving...</p>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
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
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
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
                    className="font-medium normal-case border-destructive text-destructive hover:bg-destructive/10"
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

          {onEnrich && state.itemId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isEnriching || state.isSaving}
                  onClick={onEnrich}
                  className="hidden sm:inline-flex font-medium normal-case text-foreground"
                  style={{ borderColor: 'hsl(var(--foreground))' }}
                >
                  {isEnriching ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  {isEnriching ? 'Enriching...' : 'Enrich'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enrich content with AI suggestions</TooltipContent>
            </Tooltip>
          )}

          {contentType.id === 'personalities' && state.itemId && (
            <Tooltip>
              <TooltipTrigger asChild>
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
                  className="hidden sm:inline-flex font-medium normal-case text-muted-foreground"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Datenblatt
                </Button>
              </TooltipTrigger>
              <TooltipContent>Druckfertiges Datenblatt (PDF)</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="hidden sm:inline-flex font-medium normal-case text-muted-foreground"
              >
                <Eye className="h-4 w-4 mr-1" />
                Preview
              </Button>
            </TooltipTrigger>
            <TooltipContent>Preview content</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!state.isDirty || state.isSaving}
                onClick={onReset}
                className="hidden sm:inline-flex font-medium normal-case"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>Discard changes</TooltipContent>
          </Tooltip>

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
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
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
