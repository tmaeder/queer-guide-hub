import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ExportExcelButtonProps {
  onExport: () => Promise<void>;
  label?: string;
}

export function ExportExcelButton({ onExport, label = 'Export Excel' }: ExportExcelButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    toast.success('Preparing export...: Fetching data for Excel export');

    try {
      await onExport();
      toast.success('Export complete: Your Excel file has been downloaded');
    } catch (error) {
      toast.error(`Export failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button onClick={handleExport} variant="outline" disabled={isExporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {isExporting ? (
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <Download size={16} />
      )}
      {isExporting ? 'Exporting...' : label}
    </Button>
  );
}
