import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (
    items: Array<{
      slug?: string;
      source_path?: string;
      target: string;
      status_code?: number;
      is_enabled?: boolean;
    }>,
  ) => Promise<{ success: number; errors: string[] }>;
}

export function BulkImportDialog({ open, onClose, onImport }: BulkImportDialogProps) {
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const lines = csvText
        .trim()
        .split('\n')
        .filter((l) => l.trim());
      if (lines.length < 2) {
        setResult({ success: 0, errors: ['Need at least a header row and one data row'] });
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const items = lines
        .slice(1)
        .map((line) => {
          const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
          const obj: Record<string, string | number | boolean | undefined> = {};
          headers.forEach((h, i) => {
            if (h === 'slug') obj.slug = values[i];
            if (h === 'source_path') obj.source_path = values[i];
            if (h === 'target') obj.target = values[i];
            if (h === 'status_code') obj.status_code = parseInt(values[i], 10) || 301;
            if (h === 'is_enabled') obj.is_enabled = values[i] !== 'false' && values[i] !== '0';
          });
          return obj;
        })
        .filter((item) => item.target);
      const res = await onImport(items as Array<{ slug?: string; source_path?: string; target: string; status_code?: number; is_enabled?: boolean; }>);
      setResult(res);
    } catch (err: unknown) {
      setResult({ success: 0, errors: [err instanceof Error ? err.message : 'Import failed'] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Import (CSV)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground" style={{ marginBottom: 16 }}>
          Paste CSV with headers: <code>slug,target,status_code,is_enabled</code> (for short links)
          or <code>source_path,target,status_code,is_enabled</code> (for path redirects).
        </p>
        <Textarea
          rows={8}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={`slug,target,status_code\npride-zrh,/events/pride-zurich-2026,301\nnyc-guide,/city/new-york,302`}
          style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
        {result && (
          <div style={{ marginTop: 16 }}>
            {result.success > 0 && (
              <Alert style={{ marginBottom: 8 }}>
                <AlertDescription>Imported {result.success} redirect(s)</AlertDescription>
              </Alert>
            )}
            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  {result.errors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleImport} disabled={importing || !csvText.trim()}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
