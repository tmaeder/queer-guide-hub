import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { Plus, Pin, PinOff, Trash2, StickyNote } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTripNotes, type TripNote } from '@/hooks/useTripCollaboration';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'safety', label: 'Safety' },
  { value: 'ideas', label: 'Ideas' },
];

interface Props {
  tripId: string;
}

export function TripNotes({ tripId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    data: notes,
    isLoading,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
  } = useTripNotes(tripId);

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
      updateNote.mutate(
        {
          id: editingNote.id,
          title: formTitle || undefined,
          content: formContent || undefined,
          category: formCategory,
        },
        {
          onSuccess: () => {
            toast({ title: t('trips.notes.updatedToast', 'Note updated') });
            setEditOpen(false);
          },
          onError: (err) =>
            toast({
              title: t('trips.notes.saveFailedToast', 'Failed to save note'),
              description: String(err),
              variant: 'destructive',
            }),
        },
      );
    } else {
      createNote.mutate(
        {
          title: formTitle || undefined,
          content: formContent || undefined,
          category: formCategory,
        },
        {
          onSuccess: () => {
            toast({ title: t('trips.notes.createdToast', 'Note created') });
            setEditOpen(false);
          },
          onError: (err) =>
            toast({
              title: t('trips.notes.createFailedToast', 'Failed to create note'),
              description: String(err),
              variant: 'destructive',
            }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteConfirmId) return;
    deleteNote.mutate(deleteConfirmId, {
      onSuccess: () => {
        toast({ title: t('trips.notes.deletedToast', 'Note deleted') });
        setDeleteConfirmId(null);
        setEditOpen(false);
      },
      onError: (err) =>
        toast({ title: t('trips.notes.deleteFailedToast', 'Failed to delete note'), description: String(err), variant: 'destructive' }),
    });
  };

  if (isLoading) return <PageLoadingState count={4} />;

  return (
    <Box>
      <Box className="flex items-center justify-between mb-3">
        <Typography variant="subtitle2" color="text.secondary">
          {notes?.length || 0} {(notes?.length || 0) === 1 ? t('trips.notes.note', 'note') : t('trips.notes.notes', 'notes')}
        </Typography>
        <Button size="sm" onClick={openNew}>
          <Plus size={14} />
          {t('trips.notes.newNote', 'New Note')}
        </Button>
      </Box>

      {(!notes || notes.length === 0) && (
        <ScrollReveal>
          <Box className="flex flex-col items-center justify-center py-16 text-center">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <StickyNote size={24} style={{ opacity: 0.5 }} />
            </Box>
            <Typography variant="subtitle2" fontWeight={600}>
              {t('trips.notes.noNotes', 'No notes yet')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('trips.notes.noNotesHint', 'Create one to share information with your group')}
            </Typography>
          </Box>
        </ScrollReveal>
      )}

      <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {notes?.map((note) => (
          <Card key={note.id} hoverable onClick={() => openEdit(note)}>
            <CardContent>
              <Box className="flex items-start justify-between gap-1">
                <Box className="flex items-center gap-1.5 min-w-0">
                  {note.is_pinned && <Pin size={12} style={{ flexShrink: 0 }} />}
                  <Typography variant="subtitle2" fontWeight={600} noWrap>
                    {note.title || t('trips.notes.untitled', 'Untitled')}
                  </Typography>
                </Box>
                <Badge variant="outline">{t(`trips.notes.category.${note.category || 'general'}`, note.category || 'general')}</Badge>
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
                  {note.content}
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
          </Card>
        ))}
      </Box>

      {/* Edit / Create dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNote ? t('trips.notes.editNote', 'Edit Note') : t('trips.notes.newNote', 'New Note')}</DialogTitle>
          </DialogHeader>

          <Box className="flex flex-col gap-3 mt-2">
            <TextField
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t('trips.notes.titlePlaceholder', 'Note title')}
              fullWidth
              size="small"
            />
            <TextField
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder={t('trips.notes.contentPlaceholder', 'Write your note...')}
              fullWidth
              multiline
              minRows={4}
              maxRows={12}
              size="small"
            />
            <TextField
              label={t('trips.notes.categoryLabel', 'Category')}
              select
              size="small"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              sx={{ maxWidth: 180 }}
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {t(`trips.notes.category.${c.value}`, c.label)}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Box className="flex justify-between mt-4">
            <Box className="flex gap-1">
              {editingNote && (
                <>
                  <IconButton
                    size="small"
                    onClick={() =>
                      togglePin.mutate({ id: editingNote.id, isPinned: editingNote.is_pinned })
                    }
                    title={editingNote.is_pinned ? t('trips.notes.unpin', 'Unpin') : t('trips.notes.pin', 'Pin')}
                    sx={{ minWidth: 44, minHeight: 44 }}
                  >
                    {editingNote.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => setDeleteConfirmId(editingNote.id)}
                    sx={{ minWidth: 44, minHeight: 44 }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </>
              )}
            </Box>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={createNote.isPending || updateNote.isPending}
              >
                {editingNote ? t('common.save', 'Save') : t('common.create', 'Create')}
              </Button>
            </DialogFooter>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.notes.deleteTitle', 'Delete Note')}</DialogTitle>
          </DialogHeader>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {t('trips.notes.deleteConfirm', 'Are you sure you want to delete this note? This cannot be undone.')}
          </Typography>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
