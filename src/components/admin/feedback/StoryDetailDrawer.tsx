import { useState, useMemo } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  X,
  Trash2,
  Copy,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  AlertCircle,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { storyColumns, priorities, priorityFor } from './constants';
import type {
  AdminProfile,
  FeedbackStory,
  FeedbackSubmission,
  StoryMember,
  StoryStatus,
} from './types';
import type { ApiErrorSubmission } from './claudePrompts';
import {
  formatClaudePrompt,
  formatErrorClaudePrompt,
  formatCombinedStoryPrompt,
} from './claudePrompts';
import { RoutineLoopSection } from './RoutineLoopSection';
import { StoryActivityLog } from './StoryActivityLog';

interface Props {
  open: boolean;
  story: FeedbackStory | null;
  members: StoryMember[];
  feedbackById: Record<string, FeedbackSubmission>;
  errorsById: Record<string, ApiErrorSubmission>;
  admins: AdminProfile[];
  adminById: Record<string, AdminProfile>;
  onClose: () => void;
  onRename: (title: string, summary: string) => void;
  onStatusChange: (status: StoryStatus, closeItems?: boolean) => void;
  onPriorityChange: (priority: number) => void;
  onAssign: (assigneeId: string | null) => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
  onRemoveMember: (submissionId: string) => void;
  onOpenMember: (submissionId: string, contentType: 'feedback' | 'api_error') => void;
  onSaveNarrative?: (briefTitle: string, narrative: string) => void;
  onRenarrate?: () => void;
  divergence?: { status_diff: number; priority_diff: number; assignee_diff: number } | null;
  renarrating?: boolean;
}

export function StoryDetailDrawer({
  open,
  story,
  members,
  feedbackById,
  errorsById,
  admins,
  adminById,
  onClose,
  onRename,
  onStatusChange,
  onPriorityChange,
  onAssign,
  onAddLabel,
  onRemoveLabel,
  onRemoveMember,
  onOpenMember,
  onSaveNarrative,
  onRenarrate,
  divergence,
  renarrating = false,
}: Props) {
  const [titleDraft, setTitleDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [briefDraft, setBriefDraft] = useState('');
  const [narrativeDraft, setNarrativeDraft] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveCloseItems, setResolveCloseItems] = useState(true);
  const [handoffMode, setHandoffMode] = useState<'combined' | 'per_item'>('combined');
  const [handoffExpanded, setHandoffExpanded] = useState(false);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);

  useMemo(() => {
    if (story) {
      setTitleDraft(story.title);
      setSummaryDraft(story.summary ?? '');
      setBriefDraft(story.brief_title ?? '');
      setNarrativeDraft(story.narrative ?? '');
    }
  }, [story?.id, story?.title, story?.summary, story?.brief_title, story?.narrative]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!story) return null;

  const feedbackMembers = members
    .map((m) => feedbackById[m.submission_id])
    .filter(Boolean) as FeedbackSubmission[];
  const errorMembers = members
    .map((m) => errorsById[m.submission_id])
    .filter(Boolean) as ApiErrorSubmission[];
  const openItems = members.length - feedbackMembers.length - errorMembers.length;

  const prio = priorityFor(story.priority);
  const assignee = story.assignee_id ? adminById[story.assignee_id] : null;

  const handleCombinedCopy = async () => {
    const text = formatCombinedStoryPrompt(story, feedbackMembers, errorMembers);
    try {
      await navigator.clipboard.writeText(text);
      setHandoffStatus(`Combined prompt copied (${feedbackMembers.length + errorMembers.length} items)`);
    } catch {
      setHandoffStatus('Copy failed');
    }
  };

  const handlePerItemCopy = async (id: string, type: 'feedback' | 'api_error') => {
    const text =
      type === 'feedback'
        ? formatClaudePrompt(feedbackById[id])
        : formatErrorClaudePrompt(errorsById[id]);
    try {
      await navigator.clipboard.writeText(text);
      setHandoffStatus(`Prompt copied for item ${id.slice(0, 8)}`);
    } catch {
      setHandoffStatus('Copy failed');
    }
  };

  const handleResolveConfirm = () => {
    onStatusChange('resolved', resolveCloseItems);
    setResolveModalOpen(false);
  };

  const handleStatusSelect = (s: StoryStatus) => {
    if (s === 'resolved') {
      setResolveCloseItems(true);
      setResolveModalOpen(true);
    } else {
      onStatusChange(s);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full md:max-w-[600px] sm:max-w-[600px] p-0 overflow-y-auto">
        <div className="p-5 flex flex-col gap-4 h-full overflow-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Story · {story.origin === 'ai_suggested' ? 'AI-suggested' : 'Manual'}
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>

          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft.trim() && titleDraft.trim() !== story.title) {
                onRename(titleDraft.trim(), summaryDraft);
              }
            }}
            className="border-0 border-b rounded-none px-0 text-xl font-bold focus-visible:ring-0"
          />

          <Textarea
            placeholder="Summary (optional)"
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            onBlur={() => {
              if ((summaryDraft || '') !== (story.summary ?? '')) {
                onRename(titleDraft.trim() || story.title, summaryDraft);
              }
            }}
            rows={2}
          />

          {/* Narrative */}
          {onSaveNarrative && (
            <div
              className="p-3 bg-muted flex flex-col gap-2"
              style={{ borderLeft: '3px solid hsl(var(--foreground))' }}
            >
              <div
                className="flex items-center gap-2 text-[0.65rem] font-bold uppercase"
                style={{ color: 'hsl(var(--foreground))', letterSpacing: 0.5 }}
              >
                <Sparkles size={12} />
                Story {story.narrative_edited ? '· edited' : ''}
                <div className="flex-1" />
                {onRenarrate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={renarrating}
                    onClick={onRenarrate}
                    className="h-auto py-0 px-1 text-[0.65rem]"
                  >
                    {renarrating ? 'Generating…' : story.narrative_edited ? 'Re-generate' : 'Refresh'}
                  </Button>
                )}
              </div>
              <Input
                placeholder="Brief title"
                value={briefDraft}
                onChange={(e) => setBriefDraft(e.target.value)}
                onBlur={() => {
                  if (briefDraft !== (story.brief_title ?? '') || narrativeDraft !== (story.narrative ?? '')) {
                    onSaveNarrative(briefDraft.trim(), narrativeDraft.trim());
                  }
                }}
                className="border-0 border-b rounded-none px-0 text-sm font-semibold focus-visible:ring-0"
              />
              <Textarea
                placeholder="As a [persona], I [want to …], so that [value]."
                value={narrativeDraft}
                onChange={(e) => setNarrativeDraft(e.target.value)}
                onBlur={() => {
                  if (briefDraft !== (story.brief_title ?? '') || narrativeDraft !== (story.narrative ?? '')) {
                    onSaveNarrative(briefDraft.trim(), narrativeDraft.trim());
                  }
                }}
                rows={2}
                className="italic text-xs leading-snug"
              />
            </div>
          )}

          {/* Divergence */}
          {divergence &&
            (divergence.status_diff > 0 ||
              divergence.priority_diff > 0 ||
              divergence.assignee_diff > 0) && (
              <div
                className="p-2.5 flex items-start gap-2"
                style={{
                  backgroundColor: 'color-mix(in srgb, #f59e0b 10%, transparent)',
                  borderLeft: '3px solid #f59e0b',
                }}
              >
                <AlertCircle size={14} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
                <span className="text-[0.72rem] leading-snug">
                  {divergence.status_diff > 0 && (
                    <>
                      <strong>{divergence.status_diff}</strong> member
                      {divergence.status_diff === 1 ? '' : 's'} differ on status
                    </>
                  )}
                  {divergence.priority_diff > 0 && (
                    <>
                      {divergence.status_diff > 0 && ', '}
                      <strong>{divergence.priority_diff}</strong> on priority
                    </>
                  )}
                  {divergence.assignee_diff > 0 && (
                    <>
                      {(divergence.status_diff > 0 || divergence.priority_diff > 0) && ', '}
                      <strong>{divergence.assignee_diff}</strong> on assignee
                    </>
                  )}
                  . Saving the story overrides member values.
                </span>
              </div>
            )}

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={story.status} onValueChange={(v) => handleStatusSelect(v as StoryStatus)}>
              <SelectTrigger className="min-w-[140px] w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storyColumns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(story.priority)}
              onValueChange={(v) => onPriorityChange(Number(v))}
            >
              <SelectTrigger className="min-w-[140px] w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    <span className="inline-flex items-center">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.short} · {p.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={story.assignee_id ?? 'unassigned'}
              onValueChange={(v) => onAssign(v === 'unassigned' ? null : v)}
            >
              <SelectTrigger className="min-w-[160px] w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {admins.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {a.display_name ?? a.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Labels</p>
            <div className="flex gap-1 flex-wrap mt-1 items-center">
              {story.labels.map((l) => (
                <Badge
                  key={l}
                  variant="secondary"
                  className="h-5 text-[0.7rem] gap-1 cursor-pointer"
                  onClick={() => onRemoveLabel(l)}
                >
                  {l}
                  <X size={10} />
                </Badge>
              ))}
              <Input
                placeholder="add label"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && labelInput.trim()) {
                    onAddLabel(labelInput.trim());
                    setLabelInput('');
                  }
                }}
                className="w-[120px] h-7"
              />
            </div>
          </div>

          <RoutineLoopSection
            story={story}
            feedbackMembers={feedbackMembers}
            errorMembers={errorMembers}
            memberCount={members.length}
          />

          <StoryActivityLog storyId={story.id} adminById={adminById} />

          <div>
            <p className="text-sm font-semibold mb-2">Members ({members.length})</p>
            <div className="flex flex-col gap-2">
              {feedbackMembers.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 border border-border flex items-start gap-2 rounded"
                >
                  <MessageSquare size={14} style={{ marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{item.data.title}</p>
                    <span className="text-xs text-muted-foreground block">
                      {item.feedback_status} · {item.data.category}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpenMember(item.id, 'feedback')}>
                        <ExternalLink size={12} className="mr-2" /> Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePerItemCopy(item.id, 'feedback')}>
                        <Copy size={12} className="mr-2" /> Copy prompt
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onRemoveMember(item.id)} className="text-destructive">
                        <Trash2 size={12} className="mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              {errorMembers.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 border border-border flex items-start gap-2 rounded"
                >
                  <AlertTriangle size={14} style={{ marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">
                      {item.data.function_name}: {item.data.message}
                    </p>
                    <span className="text-xs text-muted-foreground block">
                      {item.data.service} · {item.occurrence_count} occurrences
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpenMember(item.id, 'api_error')}>
                        <ExternalLink size={12} className="mr-2" /> Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePerItemCopy(item.id, 'api_error')}>
                        <Copy size={12} className="mr-2" /> Copy prompt
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onRemoveMember(item.id)} className="text-destructive">
                        <Trash2 size={12} className="mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              {openItems > 0 && (
                <span className="text-xs text-muted-foreground">
                  {openItems} member(s) not loaded on this tab.
                </span>
              )}
            </div>
          </div>

          <Collapsible open={handoffExpanded} onOpenChange={setHandoffExpanded}>
            <button
              type="button"
              onClick={() => setHandoffExpanded(!handoffExpanded)}
              className="flex items-center gap-1.5 text-sm font-semibold cursor-pointer w-full"
            >
              {handoffExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Advanced handoff
            </button>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={handoffMode === 'combined' ? 'default' : 'outline'}
                  onClick={() => setHandoffMode('combined')}
                >
                  Combined prompt
                </Button>
                <Button
                  size="sm"
                  variant={handoffMode === 'per_item' ? 'default' : 'outline'}
                  onClick={() => setHandoffMode('per_item')}
                >
                  Per-item
                </Button>
              </div>
              {handoffMode === 'combined' ? (
                <Button size="sm" onClick={handleCombinedCopy}>
                  <Copy size={14} />
                  Copy combined prompt
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Use the ··· menu on each member above.
                </span>
              )}
              {handoffStatus && (
                <span className="text-xs text-muted-foreground block">{handoffStatus}</span>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="mt-auto flex gap-2 items-center flex-wrap">
            <Badge style={{ backgroundColor: prio.color, color: 'white' }}>{prio.short}</Badge>
            {assignee && <Badge variant="secondary">{assignee.display_name ?? 'assigned'}</Badge>}
          </div>
        </div>

        <Dialog open={resolveModalOpen} onOpenChange={(o) => !o && setResolveModalOpen(false)}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Resolve story</DialogTitle>
            </DialogHeader>
            <p className="text-sm mb-2">Mark "{story.title}" as resolved?</p>
            <div className="flex items-center gap-2">
              <Switch
                id="resolve-close-items"
                checked={resolveCloseItems}
                onCheckedChange={setResolveCloseItems}
              />
              <Label htmlFor="resolve-close-items">
                {`Also mark ${members.length} linked item${members.length === 1 ? '' : 's'} as done`}
              </Label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleResolveConfirm}>Resolve</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
