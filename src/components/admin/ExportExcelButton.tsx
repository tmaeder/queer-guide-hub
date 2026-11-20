import { useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { Download } from '@/components/icons';
import { toast } from 'sonner';

interface ExportExcelButtonProps {
  onExport: () => Promise<void>;
  label?: string;
  format?: 'Excel' | 'CSV';
  /** Full accessible name when the visible label is shortened. */
  ariaLabel?: string;
  size?: 'default' | 'sm';
}

export function ExportExcelButton({
  onExport,
  label,
  format = 'Excel',
  ariaLabel,
  size,
}: ExportExcelButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    toast.success(`Preparing export...: Fetching data for ${format} export`);

    try {
      await onExport();
      toast.success(`Export complete: Your ${format} file has been downloaded`);
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
      size={size}
      disabled={isExporting}
      aria-label={ariaLabel}
      style={{ alignItems: 'center' }}
      className="inline-flex gap-1.5"
    >
      {isExporting ? <TrackLoader size={16} /> : <Download size={16} />}
      {isExporting ? 'Exporting...' : (label ?? `Export ${format}`)}
    </Button>
  );
}
