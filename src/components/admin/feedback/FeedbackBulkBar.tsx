import { useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { CheckCheck, Github, Tag, UserPlus, Zap, X, Layers } from 'lucide-react';
import { kanbanColumns, priorities, type KanbanStatus } from './constants';
import type { AdminProfile, StoryWithCounts } from './types';

interface Props {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onSetStatus: (status: KanbanStatus) => void;
  onSetPriority: (priority: number) => void;
  onAssign: (assigneeId: string | null) => void;
  onAddLabel: (label: string) => void;
  onForward: () => void;
  onCreateStory?: (title: string) => void;
  onAddToStory?: (storyId: string) => void;
  /** Runs when the admin opens the Create-Story dialog — returns a seed
   *  title the model proposes for the current selection. Rejections and
   *  nulls just leave the input empty. */
  onAutoTitle?: () => Promise<string | null>;
  stories?: StoryWithCounts[];
  admins: AdminProfile[];
  loading?: boolean;
}

export function FeedbackBulkBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onSetStatus,
  onSetPriority,
  onAssign,
  onAddLabel,
  onForward,
  onCreateStory,
  onAddToStory,
  onAutoTitle,
  stories,
  admins,
  loading,
}: Props) {
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
  const [prioAnchor, setPrioAnchor] = useState<HTMLElement | null>(null);
  const [assignAnchor, setAssignAnchor] = useState<HTMLElement | null>(null);
  const [storyAnchor, setStoryAnchor] = useState<HTMLElement | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyTitleLoading, setStoryTitleLoading] = useState(false);
  const openStories = (stories ?? []).filter(
    (s) => s.status !== 'resolved' && s.status !== 'archived',
  );

  const openCreateStoryDialog = async () => {
    setStoryTitle('');
    setStoryOpen(true);
    if (!onAutoTitle) return;
    setStoryTitleLoading(true);
    try {
      const suggested = await onAutoTitle();
      // Only fill if the admin hasn't already typed something in the interim.
      setStoryTitle((prev) => (prev ? prev : suggested ?? ''));
    } catch {
      /* leave empty on failure */
    } finally {
      setStoryTitleLoading(false);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <Paper
        elevation={8}
        sx={{
          position: 'sticky',
          bottom: 16,
          mx: 'auto',
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderRadius: 2,
          zIndex: 50,
          flexWrap: 'wrap',
          maxWidth: 1200,
        }}
      >
        <Chip
          label={`${selectedCount} selected`}
          color="primary"
          size="small"
        />
        {selectedCount < totalCount && (
          <Button
            size="small"
            variant="text"
            startIcon={<CheckCheck size={14} />}
            onClick={onSelectAll}
            sx={{ textTransform: 'none' }}
          >
            Select all ({totalCount})
          </Button>
        )}
        <Button size="small" variant="text" onClick={onClear} sx={{ textTransform: 'none' }}>
          Clear
        </Button>

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          variant="outlined"
          onClick={(e) => setStatusAnchor(e.currentTarget)}
          disabled={loading}
        >
          Status
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Zap size={14} />}
          onClick={(e) => setPrioAnchor(e.currentTarget)}
          disabled={loading}
        >
          Priority
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<UserPlus size={14} />}
          onClick={(e) => setAssignAnchor(e.currentTarget)}
          disabled={loading}
        >
          Assign
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Tag size={14} />}
          onClick={() => setLabelOpen(true)}
          disabled={loading}
        >
          Label
        </Button>
        {(onCreateStory || onAddToStory) && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Layers size={14} />}
            onClick={(e) => setStoryAnchor(e.currentTarget)}
            disabled={loading}
          >
            Story
          </Button>
        )}
        <Button
          size="small"
          variant="contained"
          startIcon={<Github size={14} />}
          onClick={onForward}
          disabled={loading}
          sx={{ bgcolor: 'hsl(var(--accent-warm))', '&:hover': { bgcolor: 'hsl(var(--accent-warm))' } }}
        >
          Forward
        </Button>
      </Paper>

      <Menu
        anchorEl={storyAnchor}
        open={!!storyAnchor}
        onClose={() => setStoryAnchor(null)}
      >
        {onCreateStory && (
          <MenuItem
            onClick={() => {
              setStoryAnchor(null);
              void openCreateStoryDialog();
            }}
          >
            Create story from selection…
          </MenuItem>
        )}
        {onAddToStory && openStories.length > 0 && [
          <MenuItem key="__header" disabled>
            Add to story…
          </MenuItem>,
          ...openStories.map((s) => (
            <MenuItem
              key={s.id}
              onClick={() => {
                onAddToStory(s.id);
                setStoryAnchor(null);
              }}
            >
              {s.title} ({s.member_count})
            </MenuItem>
          )),
        ]}
        {onAddToStory && openStories.length === 0 && (
          <MenuItem disabled>No open stories yet</MenuItem>
        )}
      </Menu>

      <Dialog open={storyOpen} onClose={() => setStoryOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create story from {selectedCount} selected</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder={
              storyTitleLoading ? 'Suggesting a title…' : 'Short title for this story'
            }
            helperText={
              storyTitleLoading
                ? 'Cloudflare Llama is summarising the selection'
                : 'Edit the auto-suggested title or write your own'
            }
            value={storyTitle}
            onChange={(e) => setStoryTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && storyTitle.trim() && onCreateStory) {
                onCreateStory(storyTitle.trim());
                setStoryOpen(false);
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStoryOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!storyTitle.trim()}
            onClick={() => {
              if (onCreateStory) onCreateStory(storyTitle.trim());
              setStoryOpen(false);
            }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={statusAnchor} open={!!statusAnchor} onClose={() => setStatusAnchor(null)}>
        {kanbanColumns.map((c) => (
          <MenuItem
            key={c.id}
            onClick={() => {
              onSetStatus(c.id);
              setStatusAnchor(null);
            }}
          >
            <Box sx={{ width: 8, height: 8, bgcolor: c.color, borderRadius: '50%', mr: 1 }} />
            {c.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu anchorEl={prioAnchor} open={!!prioAnchor} onClose={() => setPrioAnchor(null)}>
        {priorities.map((p) => (
          <MenuItem
            key={p.value}
            onClick={() => {
              onSetPriority(p.value);
              setPrioAnchor(null);
            }}
          >
            <Box sx={{ width: 8, height: 8, bgcolor: p.color, borderRadius: '50%', mr: 1 }} />
            {p.short} · {p.label}
          </MenuItem>
        ))}
      </Menu>

      <Menu anchorEl={assignAnchor} open={!!assignAnchor} onClose={() => setAssignAnchor(null)}>
        <MenuItem
          onClick={() => {
            onAssign(null);
            setAssignAnchor(null);
          }}
        >
          <X size={14} style={{ marginRight: 8 }} />
          Unassign
        </MenuItem>
        {admins.map((a) => (
          <MenuItem
            key={a.user_id}
            onClick={() => {
              onAssign(a.user_id);
              setAssignAnchor(null);
            }}
          >
            {a.display_name || a.user_id.slice(0, 8)}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={labelOpen} onClose={() => setLabelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add label to {selectedCount} item{selectedCount === 1 ? '' : 's'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="e.g. regression, ux, a11y"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && labelInput.trim()) {
                onAddLabel(labelInput.trim());
                setLabelInput('');
                setLabelOpen(false);
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLabelOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!labelInput.trim()}
            onClick={() => {
              onAddLabel(labelInput.trim());
              setLabelInput('');
              setLabelOpen(false);
            }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
