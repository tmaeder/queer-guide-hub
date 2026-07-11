import { useEffect, useState } from 'react';
import { X, Link2, Ban, RotateCcw, Plus, Sparkles, Lightbulb } from 'lucide-react';
import { Github } from '@/components/icons/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { priorityFor, type KanbanStatus } from './constants';
import type {
  AdminProfile,
  FeedbackSubmission,
  FeedbackAuditEntry,
  FeedbackResolution,
  HandoffStatus,
  HandoffTarget,
  SubmissionStoryRef,
} from './types';
import { DuplicateBanner } from './DuplicateBanner';
import { DrawerTriageBar } from './DrawerTriageBar';
import { DrawerContextPanel } from './DrawerContextPanel';
import { DrawerActionFooter } from './DrawerActionFooter';
import { ReplyThread } from './ReplyThread';
import { ActivityLog } from './ActivityLog';
import { HandoffSection } from './HandoffSection';
import { formatClaudePrompt } from './claudePrompts';

interface Props {
  open: boolean;
  item: FeedbackSubmission | null;
  voteCount: number;
  admins: AdminProfile[];
  availableLabels: string[];
  watchers: AdminProfile[];
  isForwarding: boolean;
  duplicateSuggestions: Array<{ partnerId: string; suggestionId: string; similarity: number }>;
  itemsById: Record<string, FeedbackSubmission>;
  canonical: FeedbackSubmission | null;
  parentStory?: SubmissionStoryRef | null;
  onOpenStory?: (storyId: string) => void;
  onOpenPartner: (id: string) => void;
  onMergeDuplicate: (args: {
    duplicateId: string;
    canonicalId: string;
    suggestionId: string;
  }) => void;
  onDismissDuplicate: (suggestionId: string) => void;
  onToggleSpam: (isSpam: boolean) => void;
  onToggleNotify: (notify: boolean) => void;
  auditEntries: FeedbackAuditEntry[];
  adminById: Record<string, AdminProfile>;
  onSendReply: (body: string, notify: boolean) => void;
  isSendingReply: boolean;
  onResolutionChange: (resolution: FeedbackResolution | null) => void;
  onClose: () => void;
  onStatusChange: (status: KanbanStatus) => void;
  onPriorityChange: (priority: number) => void;
  onAssign: (assigneeId: string | null) => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
  onSaveNotes: (notes: string) => void;
  onForward: () => void;
  onCopyPrompt: () => void;
  onRecordHandoff: (target: HandoffTarget) => void;
  onUpdateHandoff: (handoffId: string, status: HandoffStatus) => void;
  isRecordingHandoff: boolean;
  onPromoteToRoadmap?: () => void;
}

export function FeedbackDetailDrawer({
  open,
  item,
  voteCount,
  admins,
  availableLabels,
  watchers,
  isForwarding,
  duplicateSuggestions,
  itemsById,
  canonical,
  parentStory,
  onOpenStory,
  onOpenPartner,
  onMergeDuplicate,
  onDismissDuplicate,
  onToggleSpam,
  onToggleNotify,
  auditEntries,
  adminById,
  onSendReply,
  isSendingReply,
  onResolutionChange,
  onClose,
  onStatusChange,
  onPriorityChange,
  onAssign,
  onAddLabel,
  onRemoveLabel,
  onSaveNotes,
  onForward,
  onCopyPrompt,
  onRecordHandoff,
  onUpdateHandoff,
  isRecordingHandoff,
  onPromoteToRoadmap,
}: Props) {
  const [localNotes, setLocalNotes] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (item) setLocalNotes(item.reviewer_notes || '');
  }, [item]);

  if (!item) return null;

  const cat = feedbackCategoryMap[item.data.category] || feedbackCategoryMap.idea;
  const CatIcon = cat.icon;
  const prio = priorityFor(item.priority);
  const isForwarded = !!item.github_issue_url;
  const labelSuggestions = availableLabels.filter((l) => !item.labels.includes(l));
  const replyCount = item.data.replies?.length ?? 0;
  const handoffCount = item.data.handoffs?.length ?? 0;
  const conversationCount = replyCount + handoffCount;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-[540px] p-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-2">
          {/* Banners */}
          {canonical && (
            <div
              className="mb-4 flex items-center gap-2 p-2.5"
              style={{
                border: '1px solid hsl(var(--muted-foreground) / 0.4)',
                backgroundColor: 'hsl(var(--muted-foreground) / 0.08)',
                borderRadius: 'var(--radius-badge)',
              }}
            >
              <Link2 size={14} />
              <span className="text-xs flex-1">
                Duplicate of{' '}
                <button
                  type="button"
                  onClick={() => onOpenPartner(canonical.id)}
                  className="cursor-pointer underline font-semibold bg-transparent border-0 p-0 text-inherit"
                >
                  {canonical.data?.title ?? canonical.id.slice(0, 8)}
                </button>
              </span>
            </div>
          )}

          {item.is_spam && (
            <div
              className="mb-4 flex items-center gap-2 p-2.5"
              style={{
                border: '1px solid hsl(var(--destructive) / 0.5)',
                backgroundColor: 'hsl(var(--destructive) / 0.08)',
                borderRadius: 'var(--radius-badge)',
              }}
            >
              <Ban size={14} />
              <span className="text-xs flex-1">Flagged as spam</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleSpam(false)}
                className="gap-1"
              >
                <RotateCcw size={12} />
                Restore
              </Button>
            </div>
          )}

          <DuplicateBanner
            current={item}
            suggestions={duplicateSuggestions}
            itemsById={itemsById}
            parentStory={parentStory}
            onOpenPartner={onOpenPartner}
            onOpenStory={onOpenStory}
            onMerge={onMergeDuplicate}
            onDismiss={onDismissDuplicate}
          />

          {onPromoteToRoadmap &&
            ['idea', 'improvement', 'content-idea'].includes(item.data.category) && (
              <Button
                variant="outline"
                size="sm"
                className="mb-4 w-full"
                onClick={onPromoteToRoadmap}
              >
                <Lightbulb className="h-4 w-4" />
                <span className="ml-1">Promote to roadmap</span>
              </Button>
            )}

          {isForwarded && item.feedback_status !== 'done' && (
            <div
              className="mb-4 flex items-center p-2.5 gap-2"
              style={{
                border: '1px solid hsl(var(--foreground) / 0.3)',
                backgroundColor: 'hsl(var(--foreground) / 0.55)',
                borderRadius: 'var(--radius-badge)',
              }}
            >
              <Github size={14} />
              <span className="text-xs flex-1">
                Claude is working — GitHub{' '}
                <a
                  href={item.github_issue_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold"
                >
                  #{item.github_issue_number}
                </a>
              </span>
            </div>
          )}

          {/* Title + badges + close */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap mb-1.5 gap-1">
                <Badge
                  variant="outline"
                  style={{
                    borderColor: cat.color,
                    color: cat.color,
                    alignItems: 'center',
                    fontSize: '0.65rem',
                  }}
                  className="inline-flex gap-1"
                >
                  <CatIcon style={{ width: 11, height: 11 }} />
                  {cat.label}
                </Badge>
                <Badge
                  variant="outline"
                  style={{
                    borderColor: prio.color,
                    color: prio.color,
                    fontSize: '0.65rem',
                  }}
                >
                  {prio.short}
                </Badge>
                {watchers.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    {watchers.length === 1
                      ? `${watchers[0].display_name || 'Someone'} viewing`
                      : `${watchers.length} viewing`}
                  </span>
                )}
              </div>
              <h2 className="font-bold leading-tight" style={{ fontSize: '1.15rem' }}>
                {item.data.title}
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="p-1">
              <X size={16} />
            </Button>
          </div>

          {/* Triage controls — immediately after title */}
          <DrawerTriageBar
            status={item.feedback_status || 'new'}
            priority={item.priority ?? 2}
            assigneeId={item.assignee_id}
            resolution={item.resolution}
            resolvedAt={item.resolved_at}
            admins={admins}
            onStatusChange={onStatusChange}
            onPriorityChange={onPriorityChange}
            onAssign={onAssign}
            onResolutionChange={onResolutionChange}
          />

          {/* AI triage suggestion (from feedback-autotriage) */}
          {item.autotriage?.summary && (
            <div className="mb-4 rounded-element border border-border bg-muted/40 p-2">
              <div className="flex items-center gap-1.5 mb-1 text-xs2 font-semibold text-muted-foreground">
                <Sparkles size={12} />
                AI triage
                {item.autotriage.is_probably_spam && (
                  <Badge variant="outline" className="ml-1">possible spam</Badge>
                )}
              </div>
              <p className="text-13 text-foreground mb-2">{item.autotriage.summary}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs2 text-muted-foreground">
                {item.autotriage.category && <span>category: {item.autotriage.category}</span>}
                <span>· suggested {priorityFor(item.autotriage.suggested_priority).label}</span>
                {item.autotriage.suggested_priority !== (item.priority ?? 2) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs2"
                    onClick={() => onPriorityChange(item.autotriage!.suggested_priority)}
                  >
                    Apply
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <p className="text-sm whitespace-pre-wrap mb-4 text-muted-foreground">
            {item.data.description}
          </p>

          {/* Tabbed sections */}
          <Tabs defaultValue="details" className="flex-1">
            <TabsList className="mb-4">
              <TabsTrigger value="details" className="text-xs">
                Details
              </TabsTrigger>
              <TabsTrigger value="conversation" className="text-xs">
                Conversation{conversationCount > 0 ? ` (${conversationCount})` : ''}
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs">
                Activity{auditEntries.length > 0 ? ` (${auditEntries.length})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-0">
              {/* Labels */}
              <div>
                <span className="text-xs font-semibold block mb-1">Labels</span>
                <div className="flex flex-wrap items-center gap-1">
                  {item.labels.map((l) => (
                    <Badge
                      key={l}
                      variant="secondary"
                      className="cursor-pointer"
                      style={{ fontSize: '0.7rem' }}
                      onClick={() => onRemoveLabel(l)}
                    >
                      {l} <X size={10} className="ml-1" />
                    </Badge>
                  ))}
                  <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                        <Plus size={10} />
                        Add
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[200px] p-2">
                      <Input
                        placeholder="New label…"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newLabel.trim()) {
                            onAddLabel(newLabel.trim());
                            setNewLabel('');
                            setLabelPopoverOpen(false);
                          }
                        }}
                        className="h-7 text-xs mb-2"
                        autoFocus
                      />
                      {labelSuggestions.length > 0 && (
                        <div className="flex flex-wrap" style={{ gap: 3 }}>
                          {labelSuggestions.slice(0, 8).map((l) => (
                            <Badge
                              key={l}
                              variant="outline"
                              className="cursor-pointer text-2xs"
                              onClick={() => {
                                onAddLabel(l);
                                setLabelPopoverOpen(false);
                              }}
                            >
                              {l}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Context panel (collapsible) */}
              <DrawerContextPanel
                ctx={item.data.context || {}}
                screenshotUrl={item.data.screenshot_url || null}
                voteCount={voteCount}
                submittedAt={item.submitted_at}
              />

              {/* Reviewer notes */}
              <div>
                <span className="text-xs font-semibold block mb-1">Reviewer Notes (internal)</span>
                <Textarea
                  value={localNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setLocalNotes(e.target.value)
                  }
                  onBlur={() => {
                    if (localNotes !== (item.reviewer_notes || '')) onSaveNotes(localNotes);
                  }}
                  placeholder="Internal notes (saved on blur)"
                  style={{ minHeight: 72 }}
                  className="text-xs"
                />
              </div>

              {/* Contact */}
              {item.data.contact_email && (
                <div>
                  <span className="text-xs font-semibold block mb-0.5">Contact</span>
                  <p className="text-sm">
                    <a href={`mailto:${item.data.contact_email}`}>{item.data.contact_email}</a>
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="conversation" className="space-y-4 mt-0">
              <HandoffSection
                handoffs={item.data.handoffs ?? []}
                prompt={formatClaudePrompt(item)}
                onRecord={onRecordHandoff}
                onUpdateStatus={onUpdateHandoff}
                isRecording={isRecordingHandoff}
              />
              <ReplyThread
                replies={item.data.replies ?? []}
                contactEmail={item.data.contact_email}
                onSend={onSendReply}
                isSending={isSendingReply}
              />
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <ActivityLog entries={auditEntries} adminById={adminById} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Sticky footer */}
        <DrawerActionFooter
          isSpam={item.is_spam}
          isForwarded={isForwarded}
          isForwarding={isForwarding}
          githubIssueUrl={item.github_issue_url}
          githubIssueNumber={item.github_issue_number}
          notifySubmitter={item.notify_submitter ?? true}
          hasContactEmail={!!item.data.contact_email}
          onToggleSpam={onToggleSpam}
          onToggleNotify={onToggleNotify}
          onCopyPrompt={onCopyPrompt}
          onForward={onForward}
        />
      </SheetContent>
    </Sheet>
  );
}
