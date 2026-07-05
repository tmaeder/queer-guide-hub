import { useMemo, useRef, useState } from 'react';
import { Upload, MapPin, Loader2, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations, type TripPlaceInsert } from '@/hooks/useTrips';
import { useImportVenueMatches } from '@/hooks/useImportPlaces';
import { parsePlacesFile, type ParsedPlace } from '@/lib/import/parsePlacesFile';

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  nextSortOrder: number;
}

/**
 * Import places from GPX / KML / GeoJSON (Google Takeout Saved Places) /
 * Takeout CSV into the trip's unscheduled pool. Matched venues link to the
 * QG entity (safety scores, booking links); the rest become custom pins.
 */
export function ImportPlacesDialog({ open, onClose, tripId, nextSortOrder }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addPlacesBulk } = useTripMutations();
  const fileInput = useRef<HTMLInputElement>(null);

  const [places, setPlaces] = useState<ParsedPlace[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [deselected, setDeselected] = useState<Set<number>>(new Set());

  const { data: matches, isLoading: matching } = useImportVenueMatches(places);

  const selectedRows = useMemo(
    () => (matches ?? []).filter((_, i) => !deselected.has(i)),
    [matches, deselected],
  );

  const reset = () => {
    setPlaces([]);
    setFileName(null);
    setParseError(null);
    setDeselected(new Set());
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setDeselected(new Set());
    try {
      const text = await file.text();
      const parsed = parsePlacesFile(file.name, text);
      if (parsed.length === 0) {
        setParseError(t('trips.import.noPlaces', 'No places found in this file.'));
        setPlaces([]);
        return;
      }
      setFileName(file.name);
      setPlaces(parsed);
    } catch (err) {
      setParseError(String(err instanceof Error ? err.message : err));
      setPlaces([]);
    }
  };

  const handleImport = () => {
    const rows: TripPlaceInsert[] = selectedRows.map(({ place, venue }, idx) => ({
      day_id: null,
      venue_id: venue?.id ?? null,
      event_id: null,
      hotel_id: null,
      custom_name: venue ? null : place.name,
      custom_address: null,
      latitude: venue?.latitude ?? place.lat,
      longitude: venue?.longitude ?? place.lng,
      city_id: venue?.city_id ?? null,
      country_id: venue?.country_id ?? null,
      start_time: null,
      end_time: null,
      duration_minutes: null,
      notes: place.notes,
      category: null,
      sort_order: nextSortOrder + idx,
    }));
    if (rows.length === 0) return;
    addPlacesBulk.mutate(
      { tripId, rows },
      {
        onSuccess: () => {
          toast({
            title: t('trips.import.done', '{{count}} places imported', { count: rows.length }),
            description: t(
              'trips.import.doneHint',
              'They land in the unscheduled pool — drag them onto days.',
            ),
          });
          reset();
          onClose();
        },
        onError: (err) =>
          toast({
            title: t('trips.toast.error'),
            description: String(err),
            variant: 'destructive',
          }),
      },
    );
  };

  const matchedCount = selectedRows.filter((r) => r.venue).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('trips.import.title', 'Import places')}</DialogTitle>
        </DialogHeader>

        <input
          ref={fileInput}
          type="file"
          accept=".gpx,.kml,.json,.geojson,.csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />

        {places.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="border border-dashed border-border rounded-container py-10 px-6 text-center w-full hover:bg-muted/40 transition-colors"
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              {t('trips.import.pickFile', 'Choose a file')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                'trips.import.formats',
                'GPX, KML, GeoJSON or Google Takeout (Saved Places JSON / list CSV)',
              )}
            </p>
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <Badge variant="outline">{fileName}</Badge>
              <div className="flex items-center gap-2">
                {matching ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                    {t('trips.import.matching', 'Matching venues…')}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('trips.import.matchCount', '{{count}} matched to queer.guide venues', {
                      count: matchedCount,
                    })}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
                  {t('trips.import.changeFile', 'Change file')}
                </Button>
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto border border-border rounded-element divide-y divide-border">
              {(matches ?? places.map((place) => ({ place, venue: null }))).map((row, i) => (
                <label
                  key={`${row.place.name}-${i}`}
                  className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={!deselected.has(i)}
                    onCheckedChange={(c) =>
                      setDeselected((prev) => {
                        const next = new Set(prev);
                        if (c === true) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    aria-label={row.place.name}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-13 font-medium truncate">
                      {row.venue?.name ?? row.place.name}
                    </p>
                    {row.venue ? (
                      <span className="inline-flex items-center gap-1 text-xs2 text-muted-foreground">
                        <CircleCheck className="w-3 h-3" aria-hidden />
                        {t('trips.import.matched', 'Existing venue')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs2 text-muted-foreground">
                        <MapPin className="w-3 h-3" aria-hidden />
                        {row.place.lat != null
                          ? t('trips.import.customPin', 'Custom pin')
                          : t('trips.import.noCoords', 'No coordinates — name only')}
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {parseError && <p className="text-sm text-destructive">{parseError}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedRows.length === 0 || matching || addPlacesBulk.isPending}
          >
            {addPlacesBulk.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('trips.import.confirm', 'Import {{count}} places', {
              count: selectedRows.length,
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
