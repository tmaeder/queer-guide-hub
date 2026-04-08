import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useTripExport(tripId: string | undefined) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportTripPdf = useCallback(async () => {
    if (!tripId) {
      setError('No trip ID provided');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'generate-trip-pdf',
        { body: { trip_id: tripId } },
      );

      if (fnError) {
        throw new Error(fnError.message || 'Failed to generate trip PDF');
      }

      // The response is HTML text — open it in a new tab for print-to-PDF
      let html: string;
      if (typeof data === 'string') {
        html = data;
      } else if (data instanceof Blob) {
        html = await data.text();
      } else {
        // functions.invoke may auto-parse; fall back to stringify
        html = typeof data === 'object' ? JSON.stringify(data) : String(data);
      }

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const tab = window.open(url, '_blank');

      // Clean up the object URL after a short delay
      if (tab) {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        URL.revokeObjectURL(url);
        setError('Pop-up blocked. Please allow pop-ups and try again.');
      }
    } catch (err: any) {
      console.error('Trip export error:', err);
      setError(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [tripId]);

  return { exportTripPdf, isExporting, error };
}
