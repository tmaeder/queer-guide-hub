import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Images } from 'lucide-react';
import { untypedSupabase } from '@/integrations/supabase/untyped';

interface SimilarRow {
  id: string;
  url: string | null;
  optimized_url: string | null;
  thumbnail_url: string | null;
  phash: string | null;
  distance: number;
}

/** Nearest image_assets by perceptual-hash Hamming distance (find_similar_images RPC). */
export function SimilarImagesPanel({ assetId }: { assetId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['similar-images', assetId],
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('find_similar_images', {
        p_asset_id: assetId,
        p_max_distance: 10,
        p_limit: 24,
      });
      if (error) throw error;
      return (data ?? []) as SimilarRow[];
    },
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Images size={16} /> Similar images
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Searching…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Could not load similar images.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No visually similar images found. Perceptual hashes backfill over time.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {data.map((row) => {
              const thumb = row.thumbnail_url || row.optimized_url || row.url || '';
              return (
                <Link
                  key={row.id}
                  to={`/admin/media/${row.id}`}
                  className="group relative block aspect-square overflow-hidden rounded-element border border-border"
                  title={`Hamming distance ${row.distance}`}
                >
                  {thumb ? (
                    <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-muted" />
                  )}
                  <Badge variant="secondary" className="absolute bottom-1 right-1 text-2xs">
                    Δ{row.distance}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
