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
  foursquare: 'source-foursquare',
  tripadvisor: 'import-tripadvisor-venues',
  tomtom: 'source-tomtom',
  'google-places': 'source-google-places',
};

/**
 * The source-* fetchers take a flat body (cities/locations, terms, limit);
 * `sourceType: 'import-<provider>'` keeps ingestion_staging.source_type
 * continuity with the retired import-* functions so admin-triggered rows
 * stay attributable to the manual import path. TripAdvisor still uses the
 * legacy import fn (no source-* peer) and the original config shape.
 */
function buildBody(provider: Provider, config: Record<string, unknown>): Record<string, unknown> {
  if (provider === 'tripadvisor') return config;
  const c = config as { locations?: string[]; searchTerms?: string[]; limit?: number; radius?: number };
  const body: Record<string, unknown> = {
    sourceType: `import-${provider}`,
    limit: c.limit,
    terms: c.searchTerms?.length ? c.searchTerms : undefined,
  };
  if (provider === 'google-places') {
    body.locations = c.locations;
  } else {
    body.cities = c.locations;
    if (provider === 'foursquare') body.radius = c.radius;
  }
  return body;
}

export function VenueProviderImport({ onImportComplete }: { onImportComplete?: () => void }) {
  const [dialog, setDialog] = useState<{ open: boolean; provider: Provider | null }>({
    open: false,
    provider: null,
  });
  const [isImporting, setIsImporting] = useState(false);

  const runImport = async (provider: Provider, config: Record<string, unknown>) => {
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke(FN_MAP[provider], {
        body: buildBody(provider, config),
      });
      if (error) throw error;
      if (data?.skipped) {
        toast.error(`Import skipped: ${data.reason ?? 'source unavailable'}`);
        return;
      }
      const staged = typeof data?.items === 'number' ? data.items : data?.staged;
      toast.success(
        typeof staged === 'number'
          ? `Staged ${staged} items for the review pipeline`
          : `Import completed: ${data.message}`,
      );
      onImportComplete?.();
    } catch {
      toast.error(`Import failed: could not import from ${provider}`);
    } finally {
      setIsImporting(false);
      setDialog({ open: false, provider: null });
    }
  };

  return (
    <div className="flex flex-col gap-4">
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
