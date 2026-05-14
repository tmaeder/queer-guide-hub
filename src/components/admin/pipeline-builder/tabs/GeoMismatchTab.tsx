import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MapPin, Check, X, Loader2 } from 'lucide-react';

// Geo-mismatch triage — surfaces geo_validations rows where has_mismatch=true.
// Reviewer picks: accept-validated (overwrite entity coords with geocoded coords),
// keep-original (mark not-mismatch, trust source), or skip.

interface GeoValidation {
  id: string;
  content_type: string;
  content_id: string;
  original_lat: number | null;
  original_lng: number | null;
  validated_lat: number | null;
  validated_lng: number | null;
  geocoded_address: string | null;
  country: string | null;
  city: string | null;
  confidence: number | null;
  mismatch_details: string | null;
  source: string | null;
  last_validated_at: string;
}

const TARGET_TABLES: Record<string, string> = {
  venue: 'venues',
  event: 'events',
  city: 'cities',
  country: 'countries',
  place: 'queer_villages',
  stay: 'stays',
};

export default function GeoMismatchTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['geo-mismatches'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await untypedFrom('geo_validations')
        .select('id, content_type, content_id, original_lat, original_lng, validated_lat, validated_lng, geocoded_address, country, city, confidence, mismatch_details, source, last_validated_at')
        .eq('has_mismatch', true)
        .order('last_validated_at', { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as GeoValidation[];
    },
  });

  const acceptValidated = useMutation({
    mutationFn: async (row: GeoValidation) => {
      const table = TARGET_TABLES[row.content_type];
      if (!table) throw new Error(`Unsupported content_type ${row.content_type}`);
      if (row.validated_lat == null || row.validated_lng == null) {
        throw new Error('No validated coordinates to apply');
      }
      const { error: e1 } = await untypedFrom(table)
        .update({ latitude: row.validated_lat, longitude: row.validated_lng })
        .eq('id', row.content_id);
      if (e1) throw e1;
      const { error: e2 } = await untypedFrom('geo_validations')
        .update({ has_mismatch: false, last_validated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast({ title: 'Coords updated', description: 'Validated coords applied' });
      queryClient.invalidateQueries({ queryKey: ['geo-mismatches'] });
    },
    onError: (e: Error) => toast({ title: 'Apply failed', description: e.message, variant: 'destructive' }),
      toast.success('Coords updated: Validated coords applied');
      queryClient.invalidateQueries({ queryKey: ['geo-mismatches'] });
    },
    onError: (e: Error) => toast.error(`Apply failed: ${e.message}`),
  });

  const keepOriginal = useMutation({
    mutationFn: async (row: GeoValidation) => {
      const { error } = await untypedFrom('geo_validations')
        .update({ has_mismatch: false, last_validated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Marked resolved', description: 'Kept original coords' });
      queryClient.invalidateQueries({ queryKey: ['geo-mismatches'] });
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
      toast.success('Marked resolved: Kept original coords');
      queryClient.invalidateQueries({ queryKey: ['geo-mismatches'] });
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  if (isLoading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
        No geo mismatches pending review.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={18} /> Geo mismatch review ({rows.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => {
          const distKm = r.original_lat != null && r.validated_lat != null
            ? haversineKm(r.original_lat, r.original_lng ?? 0, r.validated_lat, r.validated_lng ?? 0)
            : null;
          return (
            <div key={r.id} style={{ padding: 12, background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Badge>{r.content_type}</Badge>
                    {r.source && <Badge variant="outline">{r.source}</Badge>}
                    {r.confidence != null && <span style={{ fontSize: 12, color: '#9ca3af' }}>conf {(r.confidence * 100).toFixed(0)}%</span>}
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      {formatDistanceToNow(new Date(r.last_validated_at))} ago
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#e5e7eb' }}>
                    <strong>Original:</strong> {fmt(r.original_lat)}, {fmt(r.original_lng)}<br />
                    <strong>Validated:</strong> {fmt(r.validated_lat)}, {fmt(r.validated_lng)}
                    {distKm != null && <> &middot; {distKm.toFixed(1)} km apart</>}
                  </div>
                  {r.geocoded_address && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>↳ {r.geocoded_address}</div>}
                  {r.mismatch_details && <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>{r.mismatch_details}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <Button
                    size="sm"
                    onClick={() => acceptValidated.mutate(r)}
                    disabled={acceptValidated.isPending || r.validated_lat == null}
                  >
                    <Check size={14} /> Accept validated
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => keepOriginal.mutate(r)}
                    disabled={keepOriginal.isPending}
                  >
                    <X size={14} /> Keep original
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(5);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
