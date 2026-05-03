import { useEffect, useState } from 'react';
import {
  ChevronUp,
  Clock,
  X,
  Github,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Monitor,
  AlertTriangle,
  Wifi,
  Camera,
  Copy,
  Plus,
  Link2,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { timeAgo } from '@/utils/timezone';
import { kanbanColumns, priorities, priorityFor, type KanbanStatus } from './constants';
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
  onMergeDuplicate: (args: { duplicateId: string; canonicalId: string; suggestionId: string }) => void;
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
}: Props) {
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [networkExpanded, setNetworkExpanded] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [localNotes, setLocalNotes] = useState('');
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (item) setLocalNotes(item.reviewer_notes || '');
  }, [item]);

  if (!item) return null;

  const cat = feedbackCategoryMap[item.data.category] || feedbackCategoryMap.idea;
  const CatIcon = cat.icon;
  const prio = priorityFor(item.priority);
  const ctx = item.data.context || {};
  const isForwarded = !!item.github_issue_url;
  const assignee = item.assignee_id ? admins.find((a) => a.user_id === item.assignee_id) : null;
  const labelSuggestions = availableLabels.filter((l) => !item.labels.includes(l));

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[540px] p-6 overflow-y-auto">
        {canonical && (
          <div
            className="mb-4 flex items-center gap-2"
            style={{
              padding: 12,
              borderLeft: '3px solid #6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              borderRadius: 4,
            }}
          >
            <Link2 size={14} />
            <span className="text-xs flex-1">
              Duplicate of{' '}
              <span
                onClick={() => onOpenPartner(canonical.id)}
                className="cursor-pointer underline font-semibold"
              >
                {canonical.data?.title ?? canonical.id.slice(0, 8)}
              </span>
            </span>
          </div>
        )}

        {item.is_spam && (
          <div
            className="mb-4 flex items-center gap-2"
            style={{
              padding: 12,
              borderLeft: '3px solid #ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderRadius: 4,
            }}
          >
            <Ban size={14} />
            <span className="text-xs flex-1">Flagged as spam</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggleSpam(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RotateCcw style={{ width: 12, height: 12 }} />
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

        <div className="flex items-start gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center flex-wrap mb-2" style={{ gap: 6 }}>
              <Badge
                variant="outline"
                style={{
                  borderColor: cat.color,
                  color: cat.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <CatIcon style={{ width: 12, height: 12 }} />
                {cat.label}
              </Badge>
              <Badge
                variant="outline"
                style={{
                  borderColor: prio.color,
                  color: prio.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {prio.short}
              </Badge>
              {isForwarded && (
                <Badge
                  variant="outline"
                  style={{
                    borderColor: '#6366f1',
                    color: '#6366f1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Github style={{ width: 11, height: 11 }} />
                  Forwarded
                </Badge>
              )}
              {watchers.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {watchers.length === 1
                    ? `${watchers[0].display_name || 'Someone'} is viewing`
                    : `${watchers.length} admins viewing`}
                </span>
              )}
            </div>
            <h2 className="font-bold leading-tight" style={{ fontSize: '1.25rem' }}>
              {item.data.title}
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} style={{ padding: 6 }}>
            <X style={{ width: 16, height: 16 }} />
          </Button>
        </div>

        <p className="text-sm whitespace-pre-wrap mb-6 text-muted-foreground">
          {item.data.description}
        </p>

        {/* Status · Priority · Assignee */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <span className="text-xs font-semibold block mb-1">Status</span>
            <Select
              value={item.feedback_status || 'new'}
              onValueChange={(v) => onStatusChange(v as KanbanStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kanbanColumns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center">
                      <span
                        className="inline-block mr-2"
                        style={{
                          width: 8,
                          height: 8,
                          backgroundColor: c.color,
                          borderRadius: '50%',
                        }}
                      />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="text-xs font-semibold block mb-1">Priority</span>
            <Select
              value={String(item.priority ?? 2)}
              onValueChange={(v) => onPriorityChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    <span className="inline-flex items-center">
                      <span
                        className="inline-block mr-2"
                        style={{
                          width: 8,
                          height: 8,
                          backgroundColor: p.color,
                          borderRadius: '50%',
                        }}
                      />
                      {p.short} · {p.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <span className="text-xs font-semibold block mb-1">Assignee</span>
            <Select
              value={item.assignee_id ?? '__unassigned__'}
              onValueChange={(v) => onAssign(v === '__unassigned__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">
                  <em>Unassigned</em>
                </SelectItem>
                {admins.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    <span className="inline-flex items-center">
                      <Avatar style={{ width: 18, height: 18, marginRight: 8, fontSize: '0.65rem' }}>
                        {a.avatar_url && <AvatarImage src={a.avatar_url} alt="" />}
                        <AvatarFallback>{(a.display_name || '?').slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      {a.display_name || a.user_id.slice(0, 8)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignee && (
              <span className="text-xs text-muted-foreground mt-1 block">
                Assigned to {assignee.display_name || assignee.user_id.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="col-span-2">
            <span className="text-xs font-semibold block mb-1">
              Resolution {item.resolved_at && `(closed ${timeAgo(item.resolved_at)})`}
            </span>
            <Select
              value={item.resolution ?? '__none__'}
              onValueChange={(v) => {
                onResolutionChange(v === '__none__' ? null : (v as FeedbackResolution));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <em>Not resolved</em>
                </SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="wontfix">Won't fix</SelectItem>
                <SelectItem value="duplicate">Duplicate</SelectItem>
                <SelectItem value="invalid">Invalid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Labels */}
        <div className="mb-6">
          <span className="text-xs font-semibold block mb-1">Labels</span>
          <div className="flex flex-wrap items-center" style={{ gap: 4 }}>
            {item.labels.map((l) => (
              <Badge
                key={l}
                variant="secondary"
                className="cursor-pointer"
                style={{ fontSize: '0.7rem' }}
                onClick={() => onRemoveLabel(l)}
              >
                {l} <X style={{ width: 10, height: 10, marginLeft: 4 }} />
              </Badge>
            ))}
            <div className="relative" style={{ width: 140 }}>
              <Input
                placeholder="Add label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim()) {
                    onAddLabel(newLabel.trim());
                    setNewLabel('');
                  }
                }}
                style={{ height: 32, paddingRight: newLabel.trim() ? 28 : undefined }}
              />
              {newLabel.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    onAddLabel(newLabel.trim());
                    setNewLabel('');
                  }}
                  className="absolute inline-flex"
                  style={{
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                  aria-label="Add label"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
          {labelSuggestions.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 4, marginTop: 6 }}>
              {labelSuggestions.slice(0, 8).map((l) => (
                <Badge
                  key={l}
                  variant="outline"
                  className="cursor-pointer"
                  style={{ fontSize: '0.65rem' }}
                  onClick={() => onAddLabel(l)}
                >
                  + {l}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3 mb-6 bg-muted" style={{ padding: 12, borderRadius: 4 }}>
          <MetaItem icon={ChevronUp} label="Votes" value={String(voteCount)} />
          <MetaItem icon={Clock} label="Submitted" value={timeAgo(item.submitted_at)} />
          {ctx.viewport && (
            <MetaItem
              icon={Monitor}
              label="Viewport"
              value={`${ctx.viewport.width}×${ctx.viewport.height}`}
            />
          )}
          {ctx.color_scheme && <MetaItem icon={Monitor} label="Theme" value={ctx.color_scheme} />}
        </div>

        {ctx.url && (
          <div className="mb-4">
            <span className="text-xs font-semibold block mb-1">Page URL</span>
            <div
              className="flex items-center bg-muted"
              style={{
                gap: 6,
                padding: 8,
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: '0.7rem',
              }}
            >
              <a
                href={ctx.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {ctx.url}
              </a>
              <ExternalLink style={{ width: 11, height: 11, flexShrink: 0 }} />
            </div>
          </div>
        )}

        {ctx.user_agent && (
          <div className="mb-4">
            <span className="text-xs font-semibold block mb-1">User Agent</span>
            <span
              className="block bg-muted"
              style={{
                padding: 8,
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                wordBreak: 'break-all',
              }}
            >
              {ctx.user_agent}
            </span>
          </div>
        )}

        {item.data.screenshot_url && (
          <div className="mb-4">
            <span className="text-xs font-semibold flex items-center mb-1" style={{ gap: 4 }}>
              <Camera style={{ width: 12, height: 12 }} /> Screenshot
            </span>
            <div
              onClick={() => setScreenshotOpen(true)}
              style={{
                borderRadius: 4,
                overflow: 'hidden',
                border: '1px solid hsl(var(--border))',
                cursor: 'pointer',
              }}
            >
              <img
                src={item.data.screenshot_url}
                alt="Page screenshot"
                style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }}
              />
            </div>
            {screenshotOpen && (
              <div
                onClick={() => setScreenshotOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.9)',
                  zIndex: 2000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <img
                  src={item.data.screenshot_url}
                  alt="Page screenshot"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>
        )}

        {ctx.errors && ctx.errors.length > 0 && (
          <div className="mb-4">
            <Collapsible open={errorsExpanded} onOpenChange={setErrorsExpanded}>
              <button
                type="button"
                onClick={() => setErrorsExpanded(!errorsExpanded)}
                className="flex items-center cursor-pointer"
                style={{ gap: 4, paddingTop: 4, paddingBottom: 4 }}
              >
                {errorsExpanded ? (
                  <ChevronDown style={{ width: 14, height: 14 }} />
                ) : (
                  <ChevronRight style={{ width: 14, height: 14 }} />
                )}
                <AlertTriangle style={{ width: 12, height: 12, color: '#ef4444' }} />
                <span className="text-xs font-semibold">
                  Console errors ({ctx.errors.length})
                </span>
              </button>
              <CollapsibleContent>
                <div
                  className="bg-muted"
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}
                >
                  {ctx.errors.map((err, i) => (
                    <div
                      key={i}
                      style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid hsl(var(--border))' }}
                    >
                      <span className="block" style={{ color: '#ef4444', fontSize: '0.65rem' }}>
                        {err.message}
                      </span>
                      {err.stack && (
                        <span
                          className="block text-muted-foreground"
                          style={{
                            fontSize: '0.6rem',
                            marginTop: 2,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {err.stack.split('\n').slice(0, 3).join('\n')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {ctx.network_failures && ctx.network_failures.length > 0 && (
          <div className="mb-4">
            <Collapsible open={networkExpanded} onOpenChange={setNetworkExpanded}>
              <button
                type="button"
                onClick={() => setNetworkExpanded(!networkExpanded)}
                className="flex items-center cursor-pointer"
                style={{ gap: 4, paddingTop: 4, paddingBottom: 4 }}
              >
                {networkExpanded ? (
                  <ChevronDown style={{ width: 14, height: 14 }} />
                ) : (
                  <ChevronRight style={{ width: 14, height: 14 }} />
                )}
                <Wifi style={{ width: 12, height: 12, color: '#f59e0b' }} />
                <span className="text-xs font-semibold">
                  Network failures ({ctx.network_failures.length})
                </span>
              </button>
              <CollapsibleContent>
                <div
                  className="bg-muted"
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}
                >
                  {ctx.network_failures.map((nf, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <span className="block" style={{ fontSize: '0.65rem' }}>
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>{nf.status}</span>{' '}
                        {nf.method} {nf.url}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {isForwarded && item.feedback_status !== 'done' && (
          <div
            className="mb-4 flex items-center"
            style={{
              padding: 10,
              borderLeft: '3px solid #8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.08)',
              borderRadius: 4,
              gap: 8,
            }}
          >
            <Github size={14} />
            <span className="text-xs flex-1">
              Claude is working on this — GitHub{' '}
              <a
                href={item.github_issue_url!}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 600 }}
              >
                #{item.github_issue_number}
              </a>
            </span>
          </div>
        )}

        <div
          className="mb-4 flex items-center bg-muted"
          style={{ padding: 8, borderRadius: 4, gap: 8 }}
        >
          <input
            id="notify-submitter-toggle"
            type="checkbox"
            checked={item.notify_submitter ?? true}
            onChange={(e) => onToggleNotify(e.target.checked)}
            style={{ margin: 0 }}
          />
          <label
            htmlFor="notify-submitter-toggle"
            style={{ fontSize: '0.75rem', cursor: 'pointer', flex: 1 }}
          >
            Email submitter on status changes
            {!item.data.contact_email && (
              <span style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>
                (no contact email — nothing will be sent)
              </span>
            )}
          </label>
        </div>

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

        <ActivityLog entries={auditEntries} adminById={adminById} />

        <div className="mb-6">
          <span className="text-xs font-semibold block mb-1">
            Reviewer Notes (internal only)
          </span>
          <Textarea
            value={localNotes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLocalNotes(e.target.value)}
            onBlur={() => {
              if (localNotes !== (item.reviewer_notes || '')) onSaveNotes(localNotes);
            }}
            placeholder="Internal notes (saved on blur)"
            style={{ minHeight: 80 }}
          />
        </div>

        {item.data.contact_email && (
          <div className="mb-4">
            <span className="text-xs font-semibold block" style={{ marginBottom: 2 }}>
              Contact
            </span>
            <p className="text-sm">
              <a href={`mailto:${item.data.contact_email}`}>{item.data.contact_email}</a>
            </p>
          </div>
        )}

        <div
          className="flex flex-wrap"
          style={{
            gap: 8,
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: '1px solid hsl(var(--border))',
          }}
        >
          {!item.is_spam && (
            <Button
              variant="outline"
              onClick={() => onToggleSpam(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Mark as spam"
            >
              <Ban style={{ width: 14, height: 14 }} />
              Spam
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onCopyPrompt}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
            title="Copy prompt only (no handoff entry)"
          >
            <Copy style={{ width: 13, height: 13 }} />
            Copy only
          </Button>
          {isForwarded ? (
            <Button
              variant="outline"
              onClick={() =>
                window.open(item.github_issue_url!, '_blank', 'noopener,noreferrer')
              }
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
            >
              <Github style={{ width: 13, height: 13 }} />
              #{item.github_issue_number}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={onForward}
              disabled={isForwarding}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
              title="Also open a GitHub issue with @claude mention"
            >
              <Github style={{ width: 13, height: 13 }} />
              {isForwarding ? 'Forwarding…' : 'GitHub'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <Icon style={{ width: 13, height: 13, color: 'var(--muted-foreground)', flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <span
          className="block text-muted-foreground"
          style={{ fontSize: '0.6rem', lineHeight: 1 }}
        >
          {label}
        </span>
        <span className="block font-semibold" style={{ fontSize: '0.75rem' }}>
          {value}
        </span>
      </div>
    </div>
  );
}
