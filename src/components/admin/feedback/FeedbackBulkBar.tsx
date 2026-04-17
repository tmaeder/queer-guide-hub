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
import { CheckCheck, Github, Tag, UserPlus, Zap, X } from 'lucide-react';
import { kanbanColumns, priorities, type KanbanStatus } from './constants';
import type { AdminProfile } from './types';

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
  admins,
  loading,
}: Props) {
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
  const [prioAnchor, setPrioAnchor] = useState<HTMLElement | null>(null);
  const [assignAnchor, setAssignAnchor] = useState<HTMLElement | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelInput, setLabelInput] = useState('');

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
