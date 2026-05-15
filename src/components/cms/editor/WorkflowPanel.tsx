/**
 * WorkflowPanel - Workflow state display and transition buttons.
 * Shows the current workflow state with a colored badge, available
 * transitions as action buttons, published timestamp, and a visibility
 * level selector. Uses the useCMSWorkflow hook for transition logic.
 */

import React, { useState, useCallback } from 'react';
import { Loader2, Clock, Eye, EyeOff, Lock, Globe, CalendarClock } from 'lucide-react';
import { useCMSWorkflow } from '@/hooks/useCMSWorkflow';
import { loadCMSContentMetadata, upsertCMSContentMetadata } from '@/hooks/useCMSContentMetadata';
import { getStateColor, getStateLabel } from '@/config/workflowConfig';
import { getContentType } from '@/config/contentTypeRegistry';
import type { WorkflowState, VisibilityLevel, WorkflowTransition } from '@/types/cms';
import { cn } from '@/lib/utils';
import { CommentThread } from '@/components/cms/CommentThread';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WorkflowPanelProps {
  contentType: string;
  itemId: string | null;
}

export function WorkflowPanel({ contentType, itemId }: WorkflowPanelProps) {
  const config = getContentType(contentType);

  const [currentState, setCurrentState] = useState<WorkflowState>('draft');
  const [publishedAt, setPublishedAt] = useState<string | undefined>(undefined);
  const [scheduledPublishAt, setScheduledPublishAt] = useState<string | undefined>(undefined);
  const [scheduleDraft, setScheduleDraft] = useState<string>('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityLevel>('public');
  const [_metadataLoaded, setMetadataLoaded] = useState(false);

  const {
    availableTransitions,
    transition,
    isTransitioning,
    error: workflowError,
  } = useCMSWorkflow(currentState);

  const [commentTarget, setCommentTarget] = useState<WorkflowTransition | null>(null);
  const [commentText, setCommentText] = useState('');

  React.useEffect(() => {
    if (!itemId || !config) return;
    loadMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, config]);

  const loadMetadata = useCallback(async () => {
    if (!itemId || !config) return;
    try {
      const data = await loadCMSContentMetadata(config.tableName, itemId);
      if (data) {
        setCurrentState((data.workflow_state as WorkflowState) || 'draft');
        setVisibility((data.visibility_level as VisibilityLevel) || 'public');
        setPublishedAt(data.published_at || undefined);
        const sched = data.scheduled_publish_at;
        setScheduledPublishAt(sched || undefined);
        setScheduleDraft(sched ? toLocalInputValue(sched) : '');
      }
      setMetadataLoaded(true);
    } catch (err) {
      console.error('WorkflowPanel: failed to load metadata', err);
      setMetadataLoaded(true);
    }
  }, [itemId, config]);

  const handleTransition = useCallback(
    async (trans: WorkflowTransition, comment?: string) => {
      if (!itemId || !config) return;

      const success = await transition(
        config.tableName,
        itemId,
        trans.to,
        comment,
      );

      if (success) {
        setCurrentState(trans.to);
        if (trans.to === 'published') {
          setPublishedAt(new Date().toISOString());
        }
        setCommentTarget(null);
        setCommentText('');
      }
    },
    [itemId, config, transition],
  );

  const handleTransitionClick = useCallback(
    (trans: WorkflowTransition) => {
      if (trans.requiresComment) {
        setCommentTarget(trans);
        setCommentText('');
      } else {
        handleTransition(trans);
      }
    },
    [handleTransition],
  );

  const handleSaveSchedule = useCallback(
    async (next: string | null) => {
      if (!itemId || !config) return;
      setSavingSchedule(true);
      try {
        await upsertCMSContentMetadata(config.tableName, itemId, {
          scheduled_publish_at: next,
        });
        setScheduledPublishAt(next || undefined);
      } catch (err) {
        console.error('Failed to save schedule:', err);
      } finally {
        setSavingSchedule(false);
      }
    },
    [itemId, config],
  );

  const handleVisibilityChange = useCallback(
    async (newVisibility: VisibilityLevel) => {
      if (!itemId || !config) return;
      setVisibility(newVisibility);

      try {
        await upsertCMSContentMetadata(config.tableName, itemId, {
          visibility_level: newVisibility,
        });
      } catch (err) {
        console.error('Failed to update visibility:', err);
      }
    },
    [itemId, config],
  );

  const stateColor = getStateColor(currentState);
  const stateLabel = getStateLabel(currentState);
  const isNewItem = !itemId;

  return (
    <div className="flex flex-col gap-3">
      {/* Current State */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Status</p>
        <Badge
          variant="outline"
          className="text-xs font-semibold gap-1.5"
          style={{ borderColor: stateColor, color: stateColor }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, backgroundColor: stateColor }}
          />
          {stateLabel}
        </Badge>
      </div>

      {/* Transition Buttons */}
      {!isNewItem && availableTransitions.length > 0 && (
        <>
          <hr className="border-border" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">
              Actions
            </p>
            <div className="flex flex-col gap-2">
              {availableTransitions.map((trans) => {
                const targetColor = getStateColor(trans.to);
                const isPublish = trans.to === 'published';

                return (
                  <Button
                    key={`${trans.from}-${trans.to}`}
                    variant={isPublish ? 'default' : 'outline'}
                    size="sm"
                    disabled={isTransitioning}
                    onClick={() => handleTransitionClick(trans)}
                    className={cn(
                      'w-full justify-start font-medium normal-case',
                      isPublish && 'bg-green-500 hover:bg-green-600 text-white',
                    )}
                  >
                    {isTransitioning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" />
                    ) : (
                      <span
                        className="inline-block rounded-full"
                        style={{ width: 8, height: 8, backgroundColor: targetColor }}
                      />
                    )}
                    {trans.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Comment dialog for transitions that require it */}
      {commentTarget && (
        <>
          <hr className="border-border" />
          <div className="rounded-element p-3 bg-gray-50 border border-gray-200">
            <p className="text-sm font-semibold mb-1">{commentTarget.label}</p>
            {commentTarget.description && (
              <p className="text-xs text-muted-foreground block mb-1.5">
                {commentTarget.description}
              </p>
            )}
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment explaining the requested changes..."
              rows={2}
              className="mb-1.5 text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isTransitioning || !commentText.trim()}
                onClick={() => handleTransition(commentTarget, commentText.trim())}
                className="flex-1 font-medium normal-case"
              >
                {isTransitioning ? 'Processing...' : commentTarget.label}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCommentTarget(null);
                  setCommentText('');
                }}
                className="normal-case"
              >
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Error message */}
      {workflowError && (
        <Alert variant="destructive" className="py-1">
          <AlertDescription className="text-xs">{workflowError}</AlertDescription>
        </Alert>
      )}

      <hr className="border-border" />

      {/* Scheduled Publish */}
      {!isNewItem && (
        <div>
          <p className="text-xs font-semibold flex items-center gap-1 mb-2 text-muted-foreground">
            <CalendarClock style={{ width: 12, height: 12 }} />
            Scheduled publish
          </p>
          <div className="flex flex-row gap-2 items-center">
            <Input
              type="datetime-local"
              value={scheduleDraft}
              onChange={(e) => setScheduleDraft(e.target.value)}
              className="text-sm h-9"
              aria-label="Scheduled publish at"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={savingSchedule || !scheduleDraft}
              onClick={() => handleSaveSchedule(new Date(scheduleDraft).toISOString())}
              className="normal-case"
            >
              {savingSchedule ? '…' : 'Set'}
            </Button>
            {scheduledPublishAt && (
              <Button
                size="sm"
                variant="ghost"
                disabled={savingSchedule}
                onClick={() => {
                  setScheduleDraft('');
                  handleSaveSchedule(null);
                }}
                className="normal-case"
              >
                Clear
              </Button>
            )}
          </div>
          {scheduledPublishAt && (
            <p className="text-xs text-muted-foreground mt-1 block">
              Will publish at {formatDatetime(scheduledPublishAt)}
            </p>
          )}
        </div>
      )}

      <hr className="border-border" />

      {/* Visibility Level */}
      <div>
        <p className="text-xs font-semibold flex items-center gap-1 mb-2 text-muted-foreground">
          <Eye style={{ width: 12, height: 12 }} />
          Visibility
        </p>
        <Select
          value={visibility}
          onValueChange={(v) => handleVisibilityChange(v as VisibilityLevel)}
          disabled={isNewItem}
        >
          <SelectTrigger className="text-sm h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">
              <div className="flex items-center gap-2">
                <Globe style={{ width: 14, height: 14, color: '#22c55e' }} />
                <span>Public</span>
              </div>
            </SelectItem>
            <SelectItem value="private">
              <div className="flex items-center gap-2">
                <EyeOff style={{ width: 14, height: 14, color: '#f59e0b' }} />
                <span>Private</span>
              </div>
            </SelectItem>
            <SelectItem value="restricted">
              <div className="flex items-center gap-2">
                <Lock style={{ width: 14, height: 14, color: '#ef4444' }} />
                <span>Restricted</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Published Timestamp */}
      {publishedAt && (
        <>
          <hr className="border-border" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock style={{ width: 12, height: 12 }} />
              Published
            </p>
            <p className="text-xs font-medium">{formatDatetime(publishedAt)}</p>
          </div>
        </>
      )}

      {/* New item notice */}
      {isNewItem && (
        <p className="text-xs text-muted-foreground">
          Save the item first to manage workflow and visibility.
        </p>
      )}

      {/* Threaded discussion */}
      {!isNewItem && itemId && config && (
        <>
          <hr className="border-border" />
          <CommentThread
            sourceTable={config.tableName}
            sourceId={itemId}
            emptyHint="No comments yet — leave one to flag changes or approvals."
          />
        </>
      )}
    </div>
  );
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDatetime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
