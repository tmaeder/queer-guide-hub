import { useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { Download} from 'lucide-react';
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
    <Button
      onClick={handleExport}
      variant="outline"
      disabled={isExporting}
      style={{ alignItems: 'center' }}
      className="inline-flex gap-1.5"
    >
      {isExporting ? (
        <TrackLoader size={16} />
      ) : (
        <Download size={16} />
      )}
      {isExporting ? 'Exporting...' : label}
    </Button>
  );
}
