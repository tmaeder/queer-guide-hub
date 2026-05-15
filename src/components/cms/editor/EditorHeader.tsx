/**
 * EditorHeader - Top bar for the CMS editor.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Save, X, RotateCcw, Eye, Pencil, Sparkles, Loader2 } from 'lucide-react';
import type { ContentTypeConfig, EditorState } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface EditorHeaderProps {
  contentType: ContentTypeConfig;
  state: EditorState;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
  onEnrich?: () => void;
  isEnriching?: boolean;
}

export function EditorHeader({
  contentType,
  state,
  onSave,
  onReset,
  onClose,
  onEnrich,
  isEnriching,
}: EditorHeaderProps) {
  const Icon = contentType.icon;
  const titleValue = (state.data[contentType.titleField] as string) ?? '';
  const displayTitle =
    titleValue || (state.itemId ? 'Untitled' : `New ${contentType.label.singular}`);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(titleValue);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
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
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background flex-shrink-0 min-h-[56px]">
      {/* Left side */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
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
                style={{ width: 13, height: 13, flexShrink: 0 }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          )}
        </div>

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
          {onEnrich && state.itemId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isEnriching || state.isSaving}
                  onClick={onEnrich}
                  className="hidden sm:inline-flex font-medium normal-case"
                  style={{ borderColor: 'hsl(var(--foreground))', color: 'hsl(var(--foreground))' }}
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                disabled={!state.isDirty || state.isSaving}
                onClick={onSave}
                className="font-semibold normal-case min-w-[80px]"
              >
                {state.isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" aria-label="Loading" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                {state.isSaving ? 'Saving...' : 'Save'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save ({saveShortcut})</TooltipContent>
          </Tooltip>

          <div className="hidden sm:block w-px h-6 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              >
                <X style={{ width: 20, height: 20 }} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close editor</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="flex items-center gap-3">
              <Eye style={{ width: 20, height: 20, opacity: 0.6 }} />
              <span className="font-semibold">Content Preview</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col gap-4">
            <div>
              <p
                className="text-xs font-semibold uppercase"
                style={{ color: contentType.color, letterSpacing: '0.5px' }}
              >
                {contentType.label.singular}
              </p>
              <h4 className="text-2xl font-bold mt-1">{displayTitle}</h4>
            </div>

            <hr className="border-border" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {contentType.fields
                .filter((f) => !f.hidden && state.data[f.name] != null && state.data[f.name] !== '')
                .map((field) => {
                  const value = state.data[field.name];
                  let displayValue: string;

                  if (typeof value === 'boolean') {
                    displayValue = value ? 'Yes' : 'No';
                  } else if (typeof value === 'object') {
                    displayValue = JSON.stringify(value, null, 2);
                  } else {
                    displayValue = String(value);
                  }

                  return (
                    <div
                      key={field.name}
                      className={field.colSpan === 2 ? 'col-span-full' : undefined}
                    >
                      <p className="text-xs text-muted-foreground font-semibold uppercase">
                        {field.label}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 break-words',
                          field.type === 'json'
                            ? 'whitespace-pre-wrap font-mono text-xs'
                            : 'text-sm',
                        )}
                      >
                        {displayValue}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
          <DialogFooter className="border-t border-border pt-3">
            <Button
              variant="ghost"
              onClick={() => setPreviewOpen(false)}
              className="font-medium normal-case"
            >
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
