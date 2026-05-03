import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { Sparkles, Check, X } from 'lucide-react';
import type { StorySuggestion } from './types';

interface Props {
  suggestions: StorySuggestion[];
  onAccept: (suggestionId: string, overrideTitle?: string) => void;
  onDismiss: (suggestionId: string) => void;
}

export function StorySuggestionsPanel({ suggestions, onAccept, onDismiss }: Props) {
  const [editing, setEditing] = useState<StorySuggestion | null>(null);
  const [editedTitle, setEditedTitle] = useState('');

  if (suggestions.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Sparkles size={14} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          AI-suggested stories ({suggestions.length})
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Clusters of ≥ 3 related items. Accept to create a story.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
        {suggestions.map((s) => (
          <Paper
            key={s.id}
            elevation={0}
            sx={{
              minWidth: 260,
              p: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {s.proposed_title}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                size="small"
                label={`${s.member_ids.length} items`}
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
              <Chip
                size="small"
                label={`${Math.round(s.avg_similarity * 100)}% match`}
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
              <Chip
                size="small"
                label={s.method}
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <Button
                size="small"
                variant="contained"
                startIcon={<Check size={12} />}
                onClick={() => onAccept(s.id)}
                sx={{ textTransform: 'none', flex: 1 }}
              >
                Accept
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setEditing(s);
                  setEditedTitle(s.proposed_title);
                }}
                sx={{ textTransform: 'none' }}
              >
                Edit
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<X size={12} />}
                onClick={() => onDismiss(s.id)}
                sx={{ textTransform: 'none', minWidth: 'auto' }}
                aria-label="Dismiss"
              />
            </Box>
          </Paper>
        ))}
      </Box>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit story title</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!editedTitle.trim()}
            onClick={() => {
              if (editing) onAccept(editing.id, editedTitle.trim());
              setEditing(null);
            }}
          >
            Accept with title
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
