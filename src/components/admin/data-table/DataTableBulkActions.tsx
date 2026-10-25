import { useState } from 'react';
import { Download, Pencil, Trash2, X } from 'lucide-react';
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
import { deleteRowsByIds } from '@/hooks/usePageFetchers';
import { fetchAdminUsersForExport } from '@/lib/adminUsers';
import { toast } from 'sonner';
import { fetchAllRows } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';
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
  /**
   * Render the Delete button. Default true, preserving the historical
   * behaviour. See `AdminTableConfig.allowBulkDelete` for why /admin/users
   * turns it off: a raw `DELETE FROM profiles` is the wrong operation, not a
   * risky version of the right one.
   */
  allowDelete?: boolean;
}

export function DataTableBulkActions({
  selectedCount,
  selectedIds,
  tableName,
  onClearSelection,
  onSuccess,
  bulkEditFields,
  extraActions,
  allowDelete = true,
}: DataTableBulkActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (selectedCount === 0) return null;

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      let rows: Array<Record<string, unknown>>;
      if (tableName === 'profiles') {
        rows = await fetchAdminUsersForExport(Array.from(selectedIds));
      } else {
        rows = await fetchAllRows<Record<string, unknown>>(
          tableName,
          '*',
          { column: 'id', ascending: true },
          1000,
          <Q,>(query: Q): Q =>
            (query as unknown as { in: (column: string, ids: string[]) => Q }).in(
              'id',
              Array.from(selectedIds),
            ),
        );
      }
      if (rows.length === 0) {
        toast.error('Nothing to export');
        return;
      }
      const headers = Array.from(
        rows.reduce<Set<string>>((acc, row) => {
          Object.keys(row).forEach((k) => acc.add(k));
          return acc;
        }, new Set()),
      );
      exportToCsv(
        rows,
        headers.map((header) => ({
          header,
          accessor: (row) => {
            const value = row[header];
            return value == null
              ? ''
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value);
          },
        })),
        `${tableName}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast.success(`Exported ${rows.length} rows`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await deleteRowsByIds(tableName, Array.from(selectedIds));
      if (error) throw error;
      toast.success(`Deleted ${selectedCount} items`);
      onClearSelection();
      onSuccess();
    } catch (_err) {
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
      <div
        className="flex items-center gap-2 px-4 py-2 border-b border-border"
        style={{ backgroundColor: 'hsl(var(--muted))' }}
      >
        <p className="text-sm font-semibold">{selectedCount} selected</p>

        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X size={14} className="mr-1" />
          Clear
        </Button>

        <div className="flex-1" />

        {bulkEditFields && bulkEditFields.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={14} className="mr-1" />
            Bulk Edit
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exporting}>
          <Download size={14} className="mr-1" />
          {exporting ? 'Exporting…' : 'Export selected (CSV)'}
        </Button>

        {extraActions}

        {allowDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            style={{ color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive))' }}
          >
            <Trash2 size={14} className="mr-1" />
            Delete
          </Button>
        )}
      </div>

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
              style={{ backgroundColor: 'hsl(var(--destructive))', color: 'white' }}
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
