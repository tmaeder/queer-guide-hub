import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History } from 'lucide-react';
import type { MediaDetailData } from './types';

interface VersionRow {
  id: string;
  version: number;
  status?: string;
  created_at: string;
}

/**
 * Read-only version lineage for an asset. Versions share a version_group_id (root asset id);
 * an asset with no prior versions shows just itself as v1. Populating new versions is done by
 * the supersede flow (image_assets.superseded_by_id) — surfaced here as it grows.
 */
export function AssetVersionSidebar({ detail }: { detail: MediaDetailData }) {
  const table = detail.source_type === 'image_asset' ? 'image_assets' : 'cms_media';
  const groupId = detail.version_group_id ?? detail.id;

  const { data: versions = [] } = useQuery({
    queryKey: ['asset-versions', table, groupId, detail.id],
    queryFn: async () => {
      const cols = detail.source_type === 'image_asset'
        ? 'id, version, status, created_at'
        : 'id, version, created_at';
      const { data, error } = await untypedFrom(table)
        .select(cols)
        .or(`version_group_id.eq.${groupId},id.eq.${detail.id}`)
        .order('version', { ascending: false });
      if (error) throw error;
      const rows = (data as VersionRow[]) ?? [];
      // De-dup (an asset can match both predicates) and guarantee the current row is present.
      const map = new Map<string, VersionRow>();
      for (const r of rows) map.set(r.id, r);
      if (!map.has(detail.id)) {
        map.set(detail.id, { id: detail.id, version: detail.version, created_at: detail.created_at });
      }
      return Array.from(map.values()).sort((a, b) => b.version - a.version);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History size={15} /> Version history
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {versions.length <= 1 && (
          <p className="text-sm text-muted-foreground">Single version — no prior revisions.</p>
        )}
        {versions.map((v) => {
          const isCurrent = v.id === detail.id;
          return (
            <div
              key={v.id}
              className="flex items-center justify-between border border-border rounded-element p-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">v{v.version}</span>
                {isCurrent && <Badge variant="secondary" className="text-2xs">Current</Badge>}
                {v.status && v.status !== 'active' && (
                  <Badge variant="outline" className="text-2xs capitalize">{v.status}</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(v.created_at).toLocaleDateString()}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
