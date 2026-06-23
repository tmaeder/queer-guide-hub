/**
 * AwinImportDialog — self-contained "Import from Awin CSV feed" trigger + dialog.
 * Extracted from the legacy AdminMarketplace page so the manual Awin import is
 * reachable from the Import data hub. Calls the `import-awin-products` edge fn.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function AwinImportDialog() {
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [params, setParams] = useState({
    csvUrl: '',
    maxProducts: 1000,
    skipRows: 0,
    batchSize: 100,
  });

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-awin-products', {
        body: params,
      });
      if (error) throw error;
      toast.success('Import successful', { description: `Imported ${data.imported} products` });
      setOpen(false);
    } catch (err: unknown) {
      toast.error(`Import failed: ${err}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download size={14} className="mr-1" /> Import from Awin
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ maxWidth: 672 }}>
          <DialogHeader>
            <DialogTitle>Import from Awin CSV Feed</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label>Custom CSV Feed URL (Optional)</Label>
              <Input
                placeholder="https://productdata.awin.com/datafeed/download/..."
                value={params.csvUrl}
                onChange={(e) => setParams((p) => ({ ...p, csvUrl: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Max Products</Label>
                <Input
                  type="number"
                  value={params.maxProducts}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, maxProducts: parseInt(e.target.value) || 1000 }))
                  }
                />
              </div>
              <div>
                <Label>Skip Rows</Label>
                <Input
                  type="number"
                  value={params.skipRows}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, skipRows: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label>Batch Size</Label>
                <Input
                  type="number"
                  value={params.batchSize}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, batchSize: parseInt(e.target.value) || 100 }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isImporting}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <RefreshCw
                      size={14}
                      style={{ animation: 'spin 1s linear infinite' }}
                      className="mr-1"
                    />
                    Importing...
                  </>
                ) : (
                  'Start Import'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
