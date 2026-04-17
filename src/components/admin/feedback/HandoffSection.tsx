import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { Button } from '@/components/ui/button';
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
  const [menuFor, setMenuFor] = useState<{
    anchor: HTMLElement;
    id: string;
  } | null>(null);
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
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, flex: 1 }}>
          Handoff {handoffs.length > 0 && `(${handoffs.length})`}
        </Typography>
      </Box>

      {/* Copy actions */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
        <Button
          onClick={() => copyAndRecord('claude-code')}
          disabled={isRecording}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'hsl(var(--accent-warm))',
            color: '#fff',
            fontWeight: 600,
          }}
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
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
          title="Record a handoff targeted at Claude web chat"
        >
          <MessageSquare style={{ width: 13, height: 13 }} />
          Chat
        </Button>
        <Button
          variant="outline"
          onClick={() => copyAndRecord('other')}
          disabled={isRecording}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}
          title="Record a handoff with a custom target"
        >
          <ArrowRight style={{ width: 13, height: 13 }} />
          Other
        </Button>
      </Box>

      {/* Timeline */}
      {sorted.length === 0 ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            py: 1,
            px: 1.25,
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontSize: '0.7rem',
          }}
        >
          No handoffs yet. Click <strong>Copy prompt for Claude</strong> to send this ticket to Claude Code.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {sorted.map((h) => {
            const statusMeta = STATUS_META[h.status] ?? STATUS_META.sent;
            const targetMeta = TARGET_META[h.target] ?? TARGET_META.other;
            const StatusIcon = statusMeta.icon;
            const TargetIcon = targetMeta.icon;
            return (
              <Box
                key={h.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.75,
                  px: 1,
                  borderLeft: 3,
                  borderColor: statusMeta.color,
                  bgcolor: 'action.hover',
                  borderRadius: '0 4px 4px 0',
                }}
              >
                <TargetIcon
                  size={14}
                  style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', display: 'block' }}>
                    <strong>{h.by_name}</strong> → {targetMeta.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: '0.6rem', display: 'block' }}
                  >
                    {timeAgo(h.at)}
                    {h.status_at && h.status !== 'sent' && (
                      <>
                        {' · '}
                        <span style={{ color: statusMeta.color }}>{statusMeta.label.toLowerCase()} {timeAgo(h.status_at)}</span>
                      </>
                    )}
                  </Typography>
                  {h.note && (
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.65rem', display: 'block', mt: 0.25, fontStyle: 'italic' }}
                    >
                      “{h.note}”
                    </Typography>
                  )}
                </Box>
                <Tooltip title={statusMeta.label}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.25,
                      px: 0.5,
                      color: statusMeta.color,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                    }}
                  >
                    <StatusIcon size={11} />
                    {statusMeta.label}
                  </Box>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                    setMenuFor({ anchor: e.currentTarget, id: h.id })
                  }
                  style={{ padding: 4, minWidth: 0 }}
                  title="Update status"
                >
                  <MoreVertical style={{ width: 12, height: 12 }} />
                </Button>
              </Box>
            );
          })}
        </Box>
      )}

      <Menu
        anchorEl={menuFor?.anchor ?? null}
        open={!!menuFor}
        onClose={() => setMenuFor(null)}
      >
        {(['sent', 'in_progress', 'resolved', 'failed'] as HandoffStatus[]).map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <MenuItem
              key={s}
              onClick={() => {
                if (menuFor) onUpdateStatus(menuFor.id, s);
                setMenuFor(null);
              }}
            >
              <Icon size={13} style={{ color: meta.color, marginRight: 8 }} />
              {meta.label}
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
}
