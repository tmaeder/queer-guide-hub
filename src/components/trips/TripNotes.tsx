import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Skeleton from '@mui/material/Skeleton';
import { Plus, Pin, PinOff, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTripNotes, type TripNote } from '@/hooks/useTripCollaboration';
import { useAuth } from '@/hooks/useAuth';

const CATEGORIES = [
  { value: 'general', label: 'General', color: 'default' as const },
  { value: 'logistics', label: 'Logistics', color: 'info' as const },
  { value: 'safety', label: 'Safety', color: 'warning' as const },
  { value: 'ideas', label: 'Ideas', color: 'success' as const },
];

interface Props {
  tripId: string;
}

export function TripNotes({ tripId }: Props) {
  const { user } = useAuth();
  const { data: notes, isLoading, createNote, updateNote, deleteNote, togglePin } =
    useTripNotes(tripId);

  const [editOpen, setEditOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<TripNote | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openNew = () => {
    setEditingNote(null);
    setFormTitle('');
    setFormContent('');
    setFormCategory('general');
    setEditOpen(true);
  };

  const openEdit = (note: TripNote) => {
    setEditingNote(note);
    setFormTitle(note.title || '');
    setFormContent(note.content || '');
    setFormCategory(note.category || 'general');
    setEditOpen(true);
  };

  const handleSave = () => {
    if (editingNote) {
      updateNote.mutate({
        id: editingNote.id,
        title: formTitle || undefined,
        content: formContent || undefined,
        category: formCategory,
      });
    } else {
      createNote.mutate({
        title: formTitle || undefined,
        content: formContent || undefined,
        category: formCategory,
      });
    }
    setEditOpen(false);
  };

  const handleDelete = () => {
    if (deleteConfirmId) {
      deleteNote.mutate(deleteConfirmId);
      setDeleteConfirmId(null);
      setEditOpen(false);
    }
  };

  const getCategoryChipColor = (cat: string | null) =>
    CATEGORIES.find((c) => c.value === cat)?.color || 'default';

  if (isLoading) {
    return (
      <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={120} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <Box className="flex items-center justify-between mb-3">
        <Typography variant="subtitle2" color="text.secondary">
          {notes?.length || 0} {(notes?.length || 0) === 1 ? 'note' : 'notes'}
        </Typography>
        <Button size="small" startIcon={<Plus size={14} />} onClick={openNew}>
          New Note
        </Button>
      </Box>

      {(!notes || notes.length === 0) && (
        <Box className="text-center py-12">
          <Typography color="text.secondary" sx={{ fontSize: 14, mb: 1 }}>
            No notes yet. Create one to share information with your travel group.
          </Typography>
        </Box>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {notes?.map((note) => (
          <Card key={note.id} variant="outlined">
            <CardActionArea onClick={() => openEdit(note)} sx={{ height: '100%' }}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box className="flex items-start justify-between gap-1">
                  <Box className="flex items-center gap-1.5 min-w-0">
                    {note.is_pinned && <Pin size={12} className="text-primary shrink-0" />}
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: 13 }}>
                      {note.title || 'Untitled'}
                    </Typography>
                  </Box>
                  <Chip
                    label={note.category || 'general'}
                    size="small"
                    color={getCategoryChipColor(note.category)}
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
                  />
                </Box>

                {note.content && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt: 0.5,
                      fontSize: 12,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {note.content.slice(0, 100)}
                    {note.content.length > 100 ? '...' : ''}
                  </Typography>
                )}

                <Box className="flex items-center gap-2 mt-1.5">
                  <Avatar
                    src={note.author?.avatar_url || undefined}
                    sx={{ width: 18, height: 18, fontSize: 10 }}
                  >
                    {(note.author?.display_name || 'U')[0].toUpperCase()}
                  </Avatar>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                  </Typography>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      {/* Edit / Create dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, pb: 1 }}>
          {editingNote ? 'Edit Note' : 'New Note'}
        </DialogTitle>
        <DialogContent>
          <TextField
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="Note title"
            fullWidth
            size="small"
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="Write your note..."
            fullWidth
            multiline
            minRows={4}
            maxRows={12}
            size="small"
            sx={{ mb: 2 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={formCategory}
              label="Category"
              onChange={(e) => setFormCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          <Box className="flex gap-1">
            {editingNote && (
              <>
                <IconButton
                  size="small"
                  onClick={() =>
                    togglePin.mutate({
                      id: editingNote.id,
                      isPinned: editingNote.is_pinned,
                    })
                  }
                  title={editingNote.is_pinned ? 'Unpin' : 'Pin'}
                >
                  {editingNote.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDeleteConfirmId(editingNote.id)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </>
            )}
          </Box>
          <Box className="flex gap-2">
            <Button onClick={() => setEditOpen(false)} size="small">
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={createNote.isPending || updateNote.isPending}
              size="small"
            >
              {editingNote ? 'Save' : 'Create'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogTitle sx={{ fontSize: 15 }}>Delete Note</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete this note? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)} size="small">
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            size="small"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
