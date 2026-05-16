import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Merge, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { DuplicateGroup, VisualDuplicatePair } from './types';

type DupeMode = 'exact' | 'visual';

export function DuplicateFinderPanel() {
  const [mode, setMode] = useState<DupeMode>('exact');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const exactQuery = useQuery({
    queryKey: ['duplicates', 'exact'],
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('find_exact_duplicates');
      if (error) throw error;
      const rows = data as Array<{
        group_hash: string;
        asset_id: string;
        url: string;
        thumbnail_url: string | null;
        file_size: number;
        created_at: string;
      }>;

      const groups = new Map<string, DuplicateGroup>();
      for (const row of rows) {
        if (!groups.has(row.group_hash)) {
          groups.set(row.group_hash, { group_hash: row.group_hash, items: [] });
        }
        groups.get(row.group_hash)!.items.push({
          asset_id: row.asset_id,
          url: row.url,
          thumbnail_url: row.thumbnail_url,
          file_size: row.file_size,
          created_at: row.created_at,
        });
      }
      return [...groups.values()];
    },
    enabled: mode === 'exact',
    staleTime: 60_000,
  });

  const visualQuery = useQuery({
    queryKey: ['duplicates', 'visual'],
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('find_visual_duplicates', {
        p_hamming_threshold: 8,
        p_limit: 200,
      });
      if (error) throw error;
      return data as VisualDuplicatePair[];
    },
    enabled: mode === 'visual',
    staleTime: 60_000,
  });

  const [selectedPrimary, setSelectedPrimary] = useState<Map<string, string>>(new Map());

  const handleMerge = async (group: DuplicateGroup) => {
    const keepId = selectedPrimary.get(group.group_hash) || group.items[0].asset_id;
    const removeIds = group.items.filter(i => i.asset_id !== keepId).map(i => i.asset_id);

    try {
      const { error } = await untypedSupabase.rpc('merge_duplicate_images', {
        p_keep_id: keepId,
        p_remove_ids: removeIds,
      });
      if (error) throw error;
      toast({ title: `Merged ${removeIds.length} duplicates` });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['unified-media'] });
    } catch {
      toast({ title: 'Merge failed', variant: 'destructive' });
    }
  };

  const handleMergePair = async (pair: VisualDuplicatePair, keepA: boolean) => {
    const keepId = keepA ? pair.asset_a : pair.asset_b;
    const removeId = keepA ? pair.asset_b : pair.asset_a;

    try {
      const { error } = await untypedSupabase.rpc('merge_duplicate_images', {
        p_keep_id: keepId,
        p_remove_ids: [removeId],
      });
      if (error) throw error;
      toast({ title: 'Merged' });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['unified-media'] });
    } catch {
      toast({ title: 'Merge failed', variant: 'destructive' });
    }
  };

  const loading = mode === 'exact' ? exactQuery.isLoading : visualQuery.isLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant={mode === 'exact' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('exact')}
        >
          Exact Duplicates
        </Button>
        <Button
          variant={mode === 'visual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('visual')}
        >
          Visual Similarity
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {mode === 'exact' && exactQuery.data && (
        <>
          {exactQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No exact duplicates found.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {exactQuery.data.length} duplicate group{exactQuery.data.length !== 1 ? 's' : ''} found
              </p>
              {exactQuery.data.map(group => (
                <Card key={group.group_hash}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {group.items.length} identical images
                      </CardTitle>
                      <Button size="sm" onClick={() => handleMerge(group)}>
                        <Merge style={{ height: 14, width: 14, marginRight: 4 }} />
                        Merge
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {group.items.map(item => {
                        const isSelected = (selectedPrimary.get(group.group_hash) || group.items[0].asset_id) === item.asset_id;
                        return (
                          <div
                            key={item.asset_id}
                            className={`relative aspect-square bg-muted cursor-pointer border-2 ${
                              isSelected ? 'border-foreground' : 'border-transparent'
                            }`}
                            onClick={() => {
                              setSelectedPrimary(prev => new Map(prev).set(group.group_hash, item.asset_id));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedPrimary(prev => new Map(prev).set(group.group_hash, item.asset_id));
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                          >
                            <img
                              src={item.thumbnail_url || item.url}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {isSelected && (
                              <div className="absolute top-1 right-1">
                                <Check style={{ height: 14, width: 14 }} />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                              <p className="text-white text-[10px] truncate">
                                {new Date(item.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'visual' && visualQuery.data && (
        <>
          {visualQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No visual duplicates found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {visualQuery.data.length} similar pair{visualQuery.data.length !== 1 ? 's' : ''} found
              </p>
              {visualQuery.data.map((pair, i) => (
                <div key={i} className="flex items-center gap-3 border border-border p-3">
                  <div className="w-20 h-20 bg-muted flex-shrink-0">
                    <img src={pair.thumb_a || pair.url_a} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Badge variant="outline" style={{ fontSize: '0.625rem' }}>
                      dist: {pair.hamming_distance}
                    </Badge>
                  </div>
                  <div className="w-20 h-20 bg-muted flex-shrink-0">
                    <img src={pair.thumb_b || pair.url_b} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex gap-1 ml-auto">
                    <Button size="sm" variant="outline" onClick={() => handleMergePair(pair, true)}>
                      Keep Left
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleMergePair(pair, false)}>
                      Keep Right
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
