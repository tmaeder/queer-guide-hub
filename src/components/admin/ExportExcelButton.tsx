import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExportExcelButtonProps {
  onExport: () => Promise<void>;
  label?: string;
}

export function ExportExcelButton({ onExport, label = 'Export Excel' }: ExportExcelButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    toast({ title: 'Preparing export...', description: 'Fetching data for Excel export' });

    try {
      await onExport();
      toast({ title: 'Export complete', description: 'Your Excel file has been downloaded' });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to generate Excel file',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button onClick={handleExport} variant="outline" disabled={isExporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {isExporting ? (
        <Loader2 style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
      ) : (
        <Download style={{ height: 16, width: 16 }} />
      )}
      {isExporting ? 'Exporting...' : label}
    </Button>
  );
}
