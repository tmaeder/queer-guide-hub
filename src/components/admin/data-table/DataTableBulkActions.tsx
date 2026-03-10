import { useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api } from '@/integrations/api/client';
import { toast } from 'sonner';
import { DataTableBulkEditDialog } from './DataTableBulkEditDialog';
import type { BulkEditFieldConfig } from './types';

interface DataTableBulkActionsProps {
  selectedCount: number;
  selectedIds: Set<string>;
  tableName: string;
  onClearSelection: () => void;
  onSuccess: () => void;
  bulkEditFields?: BulkEditFieldConfig[];
  extraActions?: React.ReactNode;
}

export function DataTableBulkActions({
  selectedCount,
  selectedIds,
  tableName,
  onClearSelection,
  onSuccess,
  bulkEditFields,
  extraActions,
}: DataTableBulkActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (selectedCount === 0) return null;

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await api
        .from(tableName as 'venues')
        .delete()
        .in('id', Array.from(selectedIds));
      if (error) throw error;
      toast.success(`Deleted ${selectedCount} items`);
      onClearSelection();
      onSuccess();
    } catch (err) {
      toast.error('Failed to delete items');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleBulkEditSuccess = () => {
    onClearSelection();
    onSuccess();
  };

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: '1px solid var(--border, #e4e4e7)',
          bgcolor: 'rgba(59, 130, 246, 0.05)',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {selectedCount} selected
        </Typography>

        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X style={{ height: 14, width: 14, marginRight: 4 }} />
          Clear
        </Button>

        <Box sx={{ flex: 1 }} />

        {bulkEditFields && bulkEditFields.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil style={{ height: 14, width: 14, marginRight: 4 }} />
            Bulk Edit
          </Button>
        )}

        {extraActions}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)' }}
        >
          <Trash2 style={{ height: 14, width: 14, marginRight: 4 }} />
          Delete
        </Button>
      </Paper>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} items?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deleting}
              style={{ backgroundColor: 'var(--destructive)', color: 'white' }}
            >
              {deleting ? 'Deleting...' : `Delete ${selectedCount} items`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Edit Dialog */}
      {bulkEditFields && (
        <DataTableBulkEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          fields={bulkEditFields}
          selectedIds={selectedIds}
          tableName={tableName}
          onSuccess={handleBulkEditSuccess}
        />
      )}
    </>
  );
}
