import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pin, PinOff, Trash2, StickyNote } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">
          {notes?.length || 0} {(notes?.length || 0) === 1 ? t('trips.notes.note', 'note') : t('trips.notes.notes', 'notes')}
        </span>
        <Button size="sm" onClick={openNew}>
          <Plus size={14} />
          {t('trips.notes.newNote', 'New Note')}
        </Button>
      </div>

      {(!notes || notes.length === 0) && (
        <ScrollReveal>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <StickyNote size={24} style={{ opacity: 0.5 }} />
            </div>
            <span className="text-sm font-semibold">
              {t('trips.notes.noNotes', 'No notes yet')}
            </span>
            <p className="text-sm text-muted-foreground">
              {t('trips.notes.noNotesHint', 'Create one to share information with your group')}
            </p>
          </div>
        </ScrollReveal>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {notes?.map((note) => (
          <Card key={note.id} hoverable onClick={() => openEdit(note)}>
            <CardContent>
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {note.is_pinned && <Pin size={12} style={{ flexShrink: 0 }} />}
                  <span className="text-sm font-semibold truncate">
                    {note.title || t('trips.notes.untitled', 'Untitled')}
                  </span>
                </div>
                <Badge variant="outline">{t(`trips.notes.category.${note.category || 'general'}`, note.category || 'general')}</Badge>
              </div>

              {note.content && (
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {note.content}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1.5">
                <Avatar className="w-[18px] h-[18px]">
                  {note.author?.avatar_url && <AvatarImage src={note.author.avatar_url} />}
                  <AvatarFallback className="text-[10px]">
                    {(note.author?.display_name || 'U')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit / Create dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNote ? t('trips.notes.editNote', 'Edit Note') : t('trips.notes.newNote', 'New Note')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-2">
            <Input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t('trips.notes.titlePlaceholder', 'Note title')}
            />
            <Textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder={t('trips.notes.contentPlaceholder', 'Write your note...')}
              rows={4}
              className="max-h-[300px]"
            />
            <div className="flex flex-col gap-1.5 max-w-[180px]">
              <Label>{t('trips.notes.categoryLabel', 'Category')}</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {t(`trips.notes.category.${c.value}`, c.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between mt-4">
            <div className="flex gap-1">
              {editingNote && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 p-0"
                    onClick={() =>
                      togglePin.mutate({ id: editingNote.id, isPinned: editingNote.is_pinned })
                    }
                    title={editingNote.is_pinned ? t('trips.notes.unpin', 'Unpin') : t('trips.notes.pin', 'Pin')}
                  >
                    {editingNote.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 p-0 text-destructive"
                    onClick={() => setDeleteConfirmId(editingNote.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </div>
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.notes.deleteTitle', 'Delete Note')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm mt-2">
            {t('trips.notes.deleteConfirm', 'Are you sure you want to delete this note? This cannot be undone.')}
          </p>
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
    </div>
  );
}
