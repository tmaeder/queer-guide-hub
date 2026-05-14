import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { formatFileSize } from './utils';

interface BucketStats {
  source_type: string;
  bucket_name: string | null;
  count: number;
  total_bytes: number;
  optimized_count: number;
  pending_count: number;
  failed_count: number;
}

interface FormatStats {
  format: string;
  count: number;
}

export function StorageBreakdown() {
  const { data, isLoading } = useQuery({
    queryKey: ['storage-breakdown'],
    queryFn: async () => {
      const { data: raw, error } = await untypedFrom('admin_media_unified')
        .select('source_type, bucket_name, file_size, optimization_status, format');
      if (error) throw error;

      const rows = raw as Array<{
        source_type: string;
        bucket_name: string | null;
        file_size: number;
        optimization_status: string;
        format: string | null;
      }>;

      const bucketMap = new Map<string, BucketStats>();
      const formatMap = new Map<string, number>();
      let totalFiles = 0;
      let totalBytes = 0;
      let totalOptimized = 0;

      for (const row of rows) {
        totalFiles++;
        totalBytes += row.file_size || 0;

        const key = `${row.source_type}:${row.bucket_name || 'external'}`;
        if (!bucketMap.has(key)) {
          bucketMap.set(key, {
            source_type: row.source_type,
            bucket_name: row.bucket_name,
            count: 0,
            total_bytes: 0,
            optimized_count: 0,
            pending_count: 0,
            failed_count: 0,
          });
        }
        const b = bucketMap.get(key)!;
        b.count++;
        b.total_bytes += row.file_size || 0;
        if (row.optimization_status === 'optimized' || row.optimization_status === 'cdn_optimized') {
          b.optimized_count++;
          totalOptimized++;
        }
        if (row.optimization_status === 'pending') b.pending_count++;
        if (row.optimization_status === 'failed') b.failed_count++;

        const fmt = (row.format || 'unknown').toLowerCase();
        formatMap.set(fmt, (formatMap.get(fmt) || 0) + 1);
      }

      const buckets = [...bucketMap.values()].sort((a, b) => b.count - a.count);
      const formats: FormatStats[] = [...formatMap.entries()]
        .map(([format, count]) => ({ format, count }))
        .sort((a, b) => b.count - a.count);

      return { buckets, formats, totalFiles, totalBytes, totalOptimized };
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { buckets, formats, totalFiles, totalBytes, totalOptimized } = data;
  const optimPct = totalFiles > 0 ? Math.round((totalOptimized / totalFiles) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalFiles.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Files</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formatFileSize(totalBytes)}</p>
            <p className="text-xs text-muted-foreground">Total Size</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{optimPct}%</p>
            <p className="text-xs text-muted-foreground">Optimized</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{formats.length}</p>
            <p className="text-xs text-muted-foreground">Formats</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By source */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {buckets.map(b => {
                const pct = totalFiles > 0 ? (b.count / totalFiles) * 100 : 0;
                return (
                  <div key={`${b.source_type}:${b.bucket_name}`} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{b.source_type === 'image_asset' ? 'Image Assets' : b.bucket_name || 'CMS Media'}</span>
                      <span className="text-muted-foreground">
                        {b.count.toLocaleString()} · {formatFileSize(b.total_bytes)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted w-full">
                      <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* By format */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By Format</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {formats.slice(0, 10).map(f => {
                const pct = totalFiles > 0 ? (f.count / totalFiles) * 100 : 0;
                return (
                  <div key={f.format} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="uppercase">{f.format}</span>
                      <span className="text-muted-foreground">{f.count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-muted w-full">
                      <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
