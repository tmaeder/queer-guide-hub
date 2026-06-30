/**
 * VenueProviderImport — provider-based venue import (Foursquare / Google Places
 * / TomTom / TripAdvisor). Extracted from the legacy AdminVenues page so the
 * manual provider import is reachable from the Import data hub. Reuses the
 * existing VenueImportDialog; each provider maps to its own edge function.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { VenueImportDialog } from './VenueImportDialog';

type Provider = 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor';

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'foursquare', label: 'Foursquare' },
  { id: 'google-places', label: 'Google Places' },
  { id: 'tomtom', label: 'TomTom' },
  { id: 'tripadvisor', label: 'TripAdvisor' },
];

const FN_MAP: Record<Provider, string> = {
  foursquare: 'import-foursquare-venues',
  tripadvisor: 'import-tripadvisor-venues',
  tomtom: 'import-tomtom-venues',
  'google-places': 'import-google-places-venues',
};

export function VenueProviderImport({ onImportComplete }: { onImportComplete?: () => void }) {
  const [dialog, setDialog] = useState<{ open: boolean; provider: Provider | null }>({
    open: false,
    provider: null,
  });
  const [isImporting, setIsImporting] = useState(false);

  const runImport = async (provider: Provider, config: Record<string, unknown>) => {
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke(FN_MAP[provider], { body: config });
      if (error) throw error;
      toast.success(`Import completed: ${data.message}`);
      onImportComplete?.();
    } catch {
      toast.error(`Import failed: could not import from ${provider}`);
    } finally {
      setIsImporting(false);
      setDialog({ open: false, provider: null });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Pull LGBTQ+ venues from a location provider into the review pipeline.
      </p>
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            size="sm"
            onClick={() => setDialog({ open: true, provider: p.id })}
          >
            <Download size={14} className="mr-1" /> {p.label}
          </Button>
        ))}
      </div>
      {dialog.provider && (
        <VenueImportDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          provider={dialog.provider}
          onImport={(config) => runImport(dialog.provider!, config as unknown as Record<string, unknown>)}
          isImporting={isImporting}
        />
      )}
    </div>
  );
}
