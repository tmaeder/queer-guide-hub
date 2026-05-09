import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Copy,
  Bot,
  MessageSquare,
  Github as GithubIcon,
  MoreVertical,
  ArrowRight,
  Check,
  X,
  Loader,
  Circle,
} from 'lucide-react';
import { timeAgo } from '@/utils/timezone';
import type {
  FeedbackHandoff,
  HandoffStatus,
  HandoffTarget,
} from './types';

interface Props {
  handoffs: FeedbackHandoff[];
  prompt: string;
  onRecord: (target: HandoffTarget) => void;
  onUpdateStatus: (handoffId: string, status: HandoffStatus) => void;
  isRecording: boolean;
}

const STATUS_META: Record<
  HandoffStatus,
  { label: string; color: string; icon: typeof Circle }
> = {
  sent: { label: 'Handed off', color: '#3b82f6', icon: ArrowRight },
  in_progress: { label: 'Working', color: '#f59e0b', icon: Loader },
  resolved: { label: 'Resolved', color: '#22c55e', icon: Check },
  failed: { label: 'Failed', color: '#ef4444', icon: X },
};

const TARGET_META: Record<
  HandoffTarget,
  { label: string; icon: typeof Bot }
> = {
  'claude-code': { label: 'Claude Code', icon: Bot },
  'claude-chat': { label: 'Claude (chat)', icon: MessageSquare },
  github: { label: 'GitHub', icon: GithubIcon },
  other: { label: 'Other', icon: Bot },
};

/**
 * Primary triage handoff surface in the drawer. Admins:
 *   1. Click "Copy prompt" — prompt goes to clipboard, a new handoff entry
 *      appears in the timeline below with status 'sent'.
 *   2. Paste into Claude Code (or wherever), work on it, come back.
 *   3. Use the 3-dot menu on the handoff entry to flip the status to
 *      'Working', 'Resolved', or 'Failed'. Adds audit trail.
 *
 * No automatic GitHub issue creation — pure copy/paste workflow.
 */
export function HandoffSection({
  handoffs,
  prompt,
  onRecord,
  onUpdateStatus,
  isRecording,
}: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const sorted = [...handoffs].sort((a, b) => (a.at < b.at ? 1 : -1));

  async function copyAndRecord(target: HandoffTarget) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      // Copy failed but still record; admin can copy manually.
    }
    onRecord(target);
  }

  return (
    <TooltipProvider>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold flex-1">
            Handoff {handoffs.length > 0 && `(${handoffs.length})`}
          </span>
        </div>

        {/* Copy actions */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <Button
            onClick={() => copyAndRecord('claude-code')}
            disabled={isRecording}
            className="flex items-center gap-1.5 font-semibold text-white"
            style={{ backgroundColor: 'hsl(var(--foreground))' }}
          >
            {copyState === 'copied' ? (
              <Check style={{ width: 14, height: 14 }} />
            ) : (
              <Copy style={{ width: 14, height: 14 }} />
            )}
            {copyState === 'copied' ? 'Copied — paste into Claude' : 'Copy prompt for Claude'}
          </Button>
          <Button
            variant="outline"
            onClick={() => copyAndRecord('claude-chat')}
            disabled={isRecording}
            className="flex items-center gap-1.5 text-xs"
            title="Record a handoff targeted at Claude web chat"
          >
            <MessageSquare style={{ width: 13, height: 13 }} />
            Chat
          </Button>
          <Button
            variant="outline"
            onClick={() => copyAndRecord('other')}
            disabled={isRecording}
            className="flex items-center gap-1.5 text-xs"
            title="Record a handoff with a custom target"
          >
            <ArrowRight style={{ width: 13, height: 13 }} />
            Other
          </Button>
        </div>

        {/* Timeline */}
        {sorted.length === 0 ? (
          <span className="block py-2 px-3 bg-muted rounded text-[0.7rem] text-muted-foreground">
            No handoffs yet. Click <strong>Copy prompt for Claude</strong> to send this ticket to Claude Code.
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            {sorted.map((h) => {
              const statusMeta = STATUS_META[h.status] ?? STATUS_META.sent;
              const targetMeta = TARGET_META[h.target] ?? TARGET_META.other;
              const StatusIcon = statusMeta.icon;
              const TargetIcon = targetMeta.icon;
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-2 py-1.5 px-2 bg-muted"
                  style={{
                    borderLeft: `3px solid ${statusMeta.color}`,
                    borderRadius: '0 4px 4px 0',
                  }}
                >
                  <TargetIcon
                    size={14}
                    style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[0.7rem] block">
                      <strong>{h.by_name}</strong> → {targetMeta.label}
                    </span>
                    <span className="text-[0.6rem] block text-muted-foreground">
                      {timeAgo(h.at)}
                      {h.status_at && h.status !== 'sent' && (
                        <>
                          {' · '}
                          <span style={{ color: statusMeta.color }}>{statusMeta.label.toLowerCase()} {timeAgo(h.status_at)}</span>
                        </>
                      )}
                    </span>
                    {h.note && (
                      <span className="text-[0.65rem] block mt-0.5 italic">
                        “{h.note}”
                      </span>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-0.5 px-1 text-[0.6rem] font-bold"
                        style={{ color: statusMeta.color }}
                      >
                        <StatusIcon size={11} />
                        {statusMeta.label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{statusMeta.label}</TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        title="Update status"
                      >
                        <MoreVertical style={{ width: 12, height: 12 }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {(['sent', 'in_progress', 'resolved', 'failed'] as HandoffStatus[]).map((s) => {
                        const meta = STATUS_META[s];
                        const Icon = meta.icon;
                        return (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => onUpdateStatus(h.id, s)}
                          >
                            <Icon size={13} style={{ color: meta.color, marginRight: 8 }} />
                            {meta.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
