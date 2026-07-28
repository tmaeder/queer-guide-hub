import { useMemo, useState } from 'react';
import { Loader2, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RoadmapItemDrawer } from '@/components/admin/feedback/RoadmapItemDrawer';
import {
  roadmapColumns,
  useRoadmapItems,
  useSetRoadmapStage,
  useUpdateRoadmapItem,
  type RoadmapItem,
} from '@/hooks/useRoadmap';

export function RoadmapTab() {
  const { data: items = [], isLoading } = useRoadmapItems();
  const updateItem = useUpdateRoadmapItem();
  const setStage = useSetRoadmapStage();
  const [openId, setOpenId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, RoadmapItem[]> = {};
    for (const col of roadmapColumns) map[col.id] = [];
    for (const it of items) (map[it.stage] ??= []).push(it);
    return map;
  }, [items]);

  const active = items.find((i) => i.id === openId) ?? null;

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-container border p-12 text-center text-muted-foreground">
        No roadmap items yet. Promote an idea from the Triage tab to start one.
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {roadmapColumns.map((col) => (
          <div key={col.id} className="w-72 flex-shrink-0">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-13 font-medium">{col.label}</span>
              <span className="text-2xs text-muted-foreground">{byStage[col.id]?.length ?? 0}</span>
            </div>
            <div className="space-y-2">
              {(byStage[col.id] ?? []).map((it) => (
                <button
                  key={it.id}
                  onClick={() => setOpenId(it.id)}
                  className="w-full rounded-element border bg-card p-4 text-left transition-colors hover:bg-accent"
                >
                  <div className="text-sm font-medium leading-snug">{it.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1">
                      <ThumbsUp className="h-3 w-3" />
                      {it.vote_rollup}
                    </Badge>
                    {it.effort && <Badge variant="outline">{it.effort}</Badge>}
                    {it.impact && <Badge variant="outline">{it.impact}</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <RoadmapItemDrawer
        open={!!openId}
        item={active}
        onClose={() => setOpenId(null)}
        onSave={(patch) => active && updateItem.mutate({ id: active.id, patch })}
        onSetStage={(stage) => active && setStage.mutate({ id: active.id, stage })}
      />
    </>
  );
}
