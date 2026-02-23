import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
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

  const handleMerge = async (mergedData: Record<string, any>, keepId: string, removeId: string) => {
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
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} />
            <Typography sx={{ ml: 2, color: 'var(--muted-foreground)' }}>Loading records...</Typography>
          </Box>
        ) : !entityA || !entityB ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ color: 'var(--muted-foreground)' }}>
              One or both records could not be loaded. They may have been deleted.
            </Typography>
          </Box>
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
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ ml: 1, color: 'var(--muted-foreground)' }}>Merging records...</Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
