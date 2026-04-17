import { useState, useMemo } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { X, Trash2, Copy, ExternalLink, MessageSquare, AlertTriangle } from 'lucide-react';
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
}: Props) {
  const [titleDraft, setTitleDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveCloseItems, setResolveCloseItems] = useState(true);
  const [handoffMode, setHandoffMode] = useState<'combined' | 'per_item'>('combined');
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);

  useMemo(() => {
    if (story) {
      setTitleDraft(story.title);
      setSummaryDraft(story.summary ?? '');
    }
  }, [story?.id, story?.title, story?.summary]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', md: 600 } } }}
    >
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="overline" color="text.secondary">
            Story · {story.origin === 'ai_suggested' ? 'AI-suggested' : 'Manual'}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <X size={16} />
          </IconButton>
        </Box>

        <TextField
          fullWidth
          variant="standard"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft.trim() && titleDraft.trim() !== story.title) {
              onRename(titleDraft.trim(), summaryDraft);
            }
          }}
          InputProps={{ style: { fontWeight: 700, fontSize: '1.25rem' } }}
        />

        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          placeholder="Summary (optional)"
          value={summaryDraft}
          onChange={(e) => setSummaryDraft(e.target.value)}
          onBlur={() => {
            if ((summaryDraft || '') !== (story.summary ?? '')) {
              onRename(titleDraft.trim() || story.title, summaryDraft);
            }
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Select
            size="small"
            value={story.status}
            onChange={(e) => handleStatusSelect(e.target.value as StoryStatus)}
            sx={{ minWidth: 140 }}
          >
            {storyColumns.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.label}
              </MenuItem>
            ))}
            <MenuItem value="archived">Archived</MenuItem>
          </Select>
          <Select
            size="small"
            value={story.priority}
            onChange={(e) => onPriorityChange(Number(e.target.value))}
            sx={{ minWidth: 140 }}
          >
            {priorities.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                <Box sx={{ width: 8, height: 8, bgcolor: p.color, borderRadius: '50%', mr: 1, display: 'inline-block' }} />
                {p.short} · {p.label}
              </MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={story.assignee_id ?? ''}
            displayEmpty
            onChange={(e) => onAssign(e.target.value ? String(e.target.value) : null)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {admins.map((a) => (
              <MenuItem key={a.user_id} value={a.user_id}>
                {a.display_name ?? a.user_id.slice(0, 8)}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">
            Labels
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {story.labels.map((l) => (
              <Chip
                key={l}
                size="small"
                label={l}
                onDelete={() => onRemoveLabel(l)}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            ))}
            <TextField
              size="small"
              placeholder="add label"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && labelInput.trim()) {
                  onAddLabel(labelInput.trim());
                  setLabelInput('');
                }
              }}
              sx={{ width: 120 }}
            />
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Members ({members.length})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {feedbackMembers.map((item) => (
              <Paper
                key={item.id}
                elevation={0}
                sx={{
                  p: 1.25,
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'start',
                  gap: 1,
                }}
              >
                <MessageSquare size={14} style={{ marginTop: 2 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.data.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {item.feedback_status} · {item.data.category}
                  </Typography>
                </Box>
                {handoffMode === 'per_item' && (
                  <IconButton
                    size="small"
                    onClick={() => handlePerItemCopy(item.id, 'feedback')}
                    aria-label="Copy prompt"
                  >
                    <Copy size={14} />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  onClick={() => onOpenMember(item.id, 'feedback')}
                  aria-label="Open item"
                >
                  <ExternalLink size={14} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onRemoveMember(item.id)}
                  aria-label="Remove from story"
                >
                  <Trash2 size={14} />
                </IconButton>
              </Paper>
            ))}
            {errorMembers.map((item) => (
              <Paper
                key={item.id}
                elevation={0}
                sx={{
                  p: 1.25,
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'start',
                  gap: 1,
                }}
              >
                <AlertTriangle size={14} style={{ marginTop: 2 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.data.function_name}: {item.data.message}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {item.data.service} · {item.occurrence_count} occurrences
                  </Typography>
                </Box>
                {handoffMode === 'per_item' && (
                  <IconButton
                    size="small"
                    onClick={() => handlePerItemCopy(item.id, 'api_error')}
                    aria-label="Copy prompt"
                  >
                    <Copy size={14} />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  onClick={() => onOpenMember(item.id, 'api_error')}
                  aria-label="Open item"
                >
                  <ExternalLink size={14} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onRemoveMember(item.id)}
                  aria-label="Remove from story"
                >
                  <Trash2 size={14} />
                </IconButton>
              </Paper>
            ))}
            {openItems > 0 && (
              <Typography variant="caption" color="text.secondary">
                {openItems} member(s) not loaded on this tab.
              </Typography>
            )}
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Handoff to Claude / GitHub
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Button
              size="small"
              variant={handoffMode === 'combined' ? 'contained' : 'outlined'}
              onClick={() => setHandoffMode('combined')}
              sx={{ textTransform: 'none' }}
            >
              Combined prompt
            </Button>
            <Button
              size="small"
              variant={handoffMode === 'per_item' ? 'contained' : 'outlined'}
              onClick={() => setHandoffMode('per_item')}
              sx={{ textTransform: 'none' }}
            >
              Per-item
            </Button>
          </Box>
          {handoffMode === 'combined' ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<Copy size={14} />}
              onClick={handleCombinedCopy}
              sx={{ textTransform: 'none' }}
            >
              Copy combined prompt
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Use the copy icon on each member above.
            </Typography>
          )}
          {handoffStatus && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {handoffStatus}
            </Typography>
          )}
        </Box>

        <Box sx={{ mt: 'auto', display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={prio.short}
            sx={{ bgcolor: prio.color, color: 'white' }}
          />
          {assignee && (
            <Chip size="small" label={assignee.display_name ?? 'assigned'} />
          )}
        </Box>
      </Box>

      <Dialog open={resolveModalOpen} onClose={() => setResolveModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Resolve story</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Mark "{story.title}" as resolved?
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={resolveCloseItems}
                onChange={(_, v) => setResolveCloseItems(v)}
              />
            }
            label={`Also mark ${members.length} linked item${members.length === 1 ? '' : 's'} as done`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveModalOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleResolveConfirm}>
            Resolve
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
