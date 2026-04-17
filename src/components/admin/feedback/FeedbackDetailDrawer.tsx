import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Drawer from '@mui/material/Drawer';
import Collapse from '@mui/material/Collapse';
import Avatar from '@mui/material/Avatar';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
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
  MessageSquarePlus,
  Copy,
  Plus,
  Link2,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { feedbackCategoryMap } from '@/config/feedbackCategories';
import { timeAgo } from '@/utils/timezone';
import { kanbanColumns, priorities, priorityFor, type KanbanStatus } from './constants';
import type {
  AdminProfile,
  FeedbackSubmission,
  FeedbackAuditEntry,
  FeedbackResolution,
} from './types';
import { DuplicateBanner } from './DuplicateBanner';
import { ReplyThread } from './ReplyThread';
import { ActivityLog } from './ActivityLog';

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
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 540 }, p: 3, overflowY: 'auto' } }}
    >
      {canonical && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderLeft: 3,
            borderColor: '#6366f1',
            bgcolor: 'rgba(99, 102, 241, 0.08)',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Link2 size={14} />
          <Typography variant="caption" sx={{ flex: 1 }}>
            Duplicate of{' '}
            <Box
              component="span"
              onClick={() => onOpenPartner(canonical.id)}
              sx={{ cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            >
              {canonical.data?.title ?? canonical.id.slice(0, 8)}
            </Box>
          </Typography>
        </Box>
      )}

      {item.is_spam && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderLeft: 3,
            borderColor: '#ef4444',
            bgcolor: 'rgba(239, 68, 68, 0.08)',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Ban size={14} />
          <Typography variant="caption" sx={{ flex: 1 }}>
            Flagged as spam
          </Typography>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onToggleSpam(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <RotateCcw style={{ width: 12, height: 12 }} />
            Restore
          </Button>
        </Box>
      )}

      <DuplicateBanner
        current={item}
        suggestions={duplicateSuggestions}
        itemsById={itemsById}
        onOpenPartner={onOpenPartner}
        onMerge={onMergeDuplicate}
        onDismiss={onDismissDuplicate}
      />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, flexWrap: 'wrap' }}>
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
              <Typography variant="caption" color="text.secondary">
                {watchers.length === 1
                  ? `${watchers[0].display_name || 'Someone'} is viewing`
                  : `${watchers.length} admins viewing`}
              </Typography>
            )}
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {item.data.title}
          </Typography>
        </Box>
        <Button variant="ghost" size="sm" onClick={onClose} style={{ padding: 6 }}>
          <X style={{ width: 16, height: 16 }} />
        </Button>
      </Box>

      <Typography
        variant="body2"
        sx={{ whiteSpace: 'pre-wrap', mb: 3, color: 'text.secondary' }}
      >
        {item.data.description}
      </Typography>

      {/* Status · Priority · Assignee */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Status
          </Typography>
          <Select
            size="small"
            fullWidth
            value={item.feedback_status || 'new'}
            onChange={(e) => onStatusChange(e.target.value as KanbanStatus)}
          >
            {kanbanColumns.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                <Box
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    bgcolor: c.color,
                    borderRadius: '50%',
                    display: 'inline-block',
                    mr: 1,
                  }}
                />
                {c.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Priority
          </Typography>
          <Select
            size="small"
            fullWidth
            value={item.priority ?? 2}
            onChange={(e) => onPriorityChange(Number(e.target.value))}
          >
            {priorities.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                <Box
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    bgcolor: p.color,
                    borderRadius: '50%',
                    display: 'inline-block',
                    mr: 1,
                  }}
                />
                {p.short} · {p.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Assignee
          </Typography>
          <Select
            size="small"
            fullWidth
            displayEmpty
            value={item.assignee_id ?? ''}
            onChange={(e) => onAssign((e.target.value as string) || null)}
          >
            <MenuItem value="">
              <em>Unassigned</em>
            </MenuItem>
            {admins.map((a) => (
              <MenuItem key={a.user_id} value={a.user_id}>
                <Avatar
                  src={a.avatar_url || undefined}
                  sx={{ width: 18, height: 18, mr: 1, fontSize: '0.65rem' }}
                >
                  {(a.display_name || '?').slice(0, 1)}
                </Avatar>
                {a.display_name || a.user_id.slice(0, 8)}
              </MenuItem>
            ))}
          </Select>
          {assignee && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Assigned to {assignee.display_name || assignee.user_id.slice(0, 8)}
            </Typography>
          )}
        </Box>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Resolution {item.resolved_at && `(closed ${timeAgo(item.resolved_at)})`}
          </Typography>
          <Select
            size="small"
            fullWidth
            displayEmpty
            value={item.resolution ?? ''}
            onChange={(e) => {
              const v = e.target.value as string;
              onResolutionChange((v || null) as FeedbackResolution | null);
            }}
          >
            <MenuItem value="">
              <em>Not resolved</em>
            </MenuItem>
            <MenuItem value="fixed">Fixed</MenuItem>
            <MenuItem value="wontfix">Won't fix</MenuItem>
            <MenuItem value="duplicate">Duplicate</MenuItem>
            <MenuItem value="invalid">Invalid</MenuItem>
          </Select>
        </Box>
      </Box>

      {/* Labels */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
          Labels
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.labels.map((l) => (
            <Chip
              key={l}
              label={l}
              size="small"
              onDelete={() => onRemoveLabel(l)}
              sx={{ fontSize: '0.7rem' }}
            />
          ))}
          <TextField
            size="small"
            placeholder="Add label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newLabel.trim()) {
                onAddLabel(newLabel.trim());
                setNewLabel('');
              }
            }}
            sx={{ width: 140 }}
            InputProps={{
              endAdornment: newLabel.trim() ? (
                <InputAdornment position="end">
                  <Box
                    component="button"
                    onClick={() => {
                      onAddLabel(newLabel.trim());
                      setNewLabel('');
                    }}
                    sx={{
                      p: 0,
                      border: 0,
                      bgcolor: 'transparent',
                      cursor: 'pointer',
                      display: 'inline-flex',
                    }}
                    aria-label="Add label"
                  >
                    <Plus size={14} />
                  </Box>
                </InputAdornment>
              ) : null,
            }}
          />
        </Box>
        {labelSuggestions.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
            {labelSuggestions.slice(0, 8).map((l) => (
              <Chip
                key={l}
                label={`+ ${l}`}
                size="small"
                variant="outlined"
                onClick={() => onAddLabel(l)}
                sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Metadata grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1.5,
          mb: 3,
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
        }}
      >
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
      </Box>

      {ctx.url && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Page URL
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              p: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
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
          </Box>
        </Box>
      )}

      {ctx.user_agent && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            User Agent
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              p: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.65rem',
              wordBreak: 'break-all',
            }}
          >
            {ctx.user_agent}
          </Typography>
        </Box>
      )}

      {item.data.screenshot_url && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
          >
            <Camera style={{ width: 12, height: 12 }} /> Screenshot
          </Typography>
          <Box
            onClick={() => setScreenshotOpen(true)}
            sx={{
              borderRadius: 1,
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
              cursor: 'pointer',
            }}
          >
            <img
              src={item.data.screenshot_url}
              alt="Page screenshot"
              style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }}
            />
          </Box>
          {screenshotOpen && (
            <Box
              onClick={() => setScreenshotOpen(false)}
              sx={{
                position: 'fixed',
                inset: 0,
                bgcolor: 'rgba(0,0,0,0.9)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
              }}
            >
              <img
                src={item.data.screenshot_url}
                alt="Page screenshot"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </Box>
          )}
        </Box>
      )}

      {ctx.errors && ctx.errors.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', py: 0.5 }}
          >
            {errorsExpanded ? (
              <ChevronDown style={{ width: 14, height: 14 }} />
            ) : (
              <ChevronRight style={{ width: 14, height: 14 }} />
            )}
            <AlertTriangle style={{ width: 12, height: 12, color: '#ef4444' }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Console errors ({ctx.errors.length})
            </Typography>
          </Box>
          <Collapse in={errorsExpanded}>
            <Box
              sx={{
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {ctx.errors.map((err, i) => (
                <Box key={i} sx={{ mb: 1, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ display: 'block', color: '#ef4444' }}>
                    {err.message}
                  </Typography>
                  {err.stack && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        color: 'text.secondary',
                        fontSize: '0.6rem',
                        mt: 0.25,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {err.stack.split('\n').slice(0, 3).join('\n')}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {ctx.network_failures && ctx.network_failures.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box
            onClick={() => setNetworkExpanded(!networkExpanded)}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', py: 0.5 }}
          >
            {networkExpanded ? (
              <ChevronDown style={{ width: 14, height: 14 }} />
            ) : (
              <ChevronRight style={{ width: 14, height: 14 }} />
            )}
            <Wifi style={{ width: 12, height: 12, color: '#f59e0b' }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Network failures ({ctx.network_failures.length})
            </Typography>
          </Box>
          <Collapse in={networkExpanded}>
            <Box
              sx={{
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {ctx.network_failures.map((nf, i) => (
                <Box key={i} sx={{ mb: 0.5 }}>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>{nf.status}</span>{' '}
                    {nf.method} {nf.url}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {isForwarded && item.feedback_status !== 'done' && (
        <Box
          sx={{
            mb: 2,
            p: 1.25,
            borderLeft: 3,
            borderColor: '#8b5cf6',
            bgcolor: 'rgba(139, 92, 246, 0.08)',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Github size={14} />
          <Typography variant="caption" sx={{ flex: 1 }}>
            Claude is working on this — GitHub{' '}
            <a
              href={item.github_issue_url!}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontWeight: 600 }}
            >
              #{item.github_issue_number}
            </a>
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          mb: 2,
          p: 1,
          bgcolor: 'action.hover',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
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
      </Box>

      <ReplyThread
        replies={item.data.replies ?? []}
        contactEmail={item.data.contact_email}
        onSend={onSendReply}
        isSending={isSendingReply}
      />

      <ActivityLog entries={auditEntries} adminById={adminById} />

      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
          Reviewer Notes (internal only)
        </Typography>
        <Textarea
          value={localNotes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLocalNotes(e.target.value)}
          onBlur={() => {
            if (localNotes !== (item.reviewer_notes || '')) onSaveNotes(localNotes);
          }}
          placeholder="Internal notes (saved on blur)"
          style={{ minHeight: 80 }}
        />
      </Box>

      {item.data.contact_email && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.25 }}>
            Contact
          </Typography>
          <Typography variant="body2">
            <a href={`mailto:${item.data.contact_email}`}>{item.data.contact_email}</a>
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button
          variant="outline"
          onClick={onCopyPrompt}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Copy style={{ width: 14, height: 14 }} />
          Copy Prompt
        </Button>
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
        {isForwarded ? (
          <Button
            variant="outline"
            onClick={() =>
              window.open(item.github_issue_url!, '_blank', 'noopener,noreferrer')
            }
            style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
          >
            <Github style={{ width: 14, height: 14 }} />
            View issue #{item.github_issue_number}
          </Button>
        ) : (
          <Button
            onClick={onForward}
            disabled={isForwarding}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              backgroundColor: '#DB2777',
              color: '#fff',
            }}
          >
            <MessageSquarePlus style={{ width: 14, height: 14 }} />
            {isForwarding ? 'Forwarding…' : 'Fix with Claude'}
          </Button>
        )}
      </Box>
    </Drawer>
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Icon style={{ width: 13, height: 13, color: 'var(--muted-foreground)', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontSize: '0.6rem', lineHeight: 1 }}
        >
          {label}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}
