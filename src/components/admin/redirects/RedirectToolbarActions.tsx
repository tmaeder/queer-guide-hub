import { useState } from 'react';
import { Eye, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { BulkImportDialog } from '@/pages/admin-redirects/BulkImportDialog';
import { PreviewDialog } from '@/pages/admin-redirects/PreviewDialog';
import { useRedirects } from '@/hooks/useRedirects';

/**
 * The two collection-level tools the standalone redirects page carried.
 *
 * They live in a component rather than directly in the content-type config
 * because both own dialog state, and configs are module-level static objects —
 * a node built there would be constructed once at import and could never hold
 * state. `toolbarActions` is a render function for exactly this reason.
 */
export function RedirectToolbarActions() {
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { bulkImport } = useRedirects();
  const queryClient = useQueryClient();

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
        <Eye size={14} className="mr-1" />
        Preview
      </Button>
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
        <Upload size={14} className="mr-1" />
        Import
      </Button>

      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} />
      <BulkImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (rows) => {
          const result = await bulkImport(rows);
          // The old page called window.location.reload(); invalidating the list
          // query refreshes in place and keeps the editor's state intact.
          await queryClient.invalidateQueries({ queryKey: ['cms-content-list'] });
          return result;
        }}
      />
    </>
  );
}
