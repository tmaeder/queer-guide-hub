import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { SideBySideComparison } from './SideBySideComparison';
import { useEntityById, useMergeEntities } from '@/hooks/useImportHubQueries';

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityAId: string;
  entityBId: string;
  onMergeComplete?: () => void;
}

export function MergeDialog({
  open,
  onOpenChange,
  entityType,
  entityAId,
  entityBId,
  onMergeComplete,
}: MergeDialogProps) {
  const { data: entityA, isLoading: loadingA } = useEntityById(entityType, open ? entityAId : null);
  const { data: entityB, isLoading: loadingB } = useEntityById(entityType, open ? entityBId : null);
  const mergeMutation = useMergeEntities();

  const loading = loadingA || loadingB;
  const nameField = entityType === 'events' ? 'title' : 'name';

  const handleMerge = async (mergedData: Record<string, unknown>, keepId: string, removeId: string) => {
    await mergeMutation.mutateAsync({
      entityType,
      keepId,
      removeId,
      mergedData,
    });
    onOpenChange(false);
    onMergeComplete?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Merge {entityType}</DialogTitle>
          <DialogDescription>
            Compare and merge two records. Click on values to select which to keep.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
            <p className="ml-4 text-muted-foreground">Loading records...</p>
          </div>
        ) : !entityA || !entityB ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              One or both records could not be loaded. They may have been deleted.
            </p>
          </div>
        ) : (
          <SideBySideComparison
            entityType={entityType}
            leftData={entityA}
            rightData={entityB}
            leftLabel={entityA[nameField] || 'Record A'}
            rightLabel={entityB[nameField] || 'Record B'}
            leftId={entityAId}
            rightId={entityBId}
            onMerge={handleMerge}
            onCancel={() => onOpenChange(false)}
          />
        )}

        {mergeMutation.isPending && (
          <div className="flex justify-center items-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
            <p className="ml-2 text-sm text-muted-foreground">Merging records...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
