import { useMemo, useState } from 'react';
import { Waypoints } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { useContentGraph } from '@/hooks/useContentGraph';
import OntologyMap from '@/components/admin/content-graph/OntologyMap';
import GraphDetailPanel from '@/components/admin/content-graph/GraphDetailPanel';
import EntityEgoExplorer from '@/components/admin/content-graph/EntityEgoExplorer';
import { edgeId, GRAPH_STROKE, typeMeta, type GraphEdgeStat } from '@/components/admin/content-graph/contentGraphMeta';

const nf = new Intl.NumberFormat('en-US');

const LEGEND: { label: string; dash: string }[] = [
  { label: 'Foreign key', dash: '' },
  { label: 'Taxonomy', dash: '6 4' },
  { label: 'Cross-entity', dash: '2 3' },
  { label: 'Media', dash: '1 4' },
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {LEGEND.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <svg width="26" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="26" y2="4" stroke={GRAPH_STROKE} strokeWidth="2" strokeDasharray={l.dash} />
          </svg>
          {l.label}
        </span>
      ))}
      <span className="text-2xs text-muted-foreground">Thickness = link count</span>
    </div>
  );
}

export default function ContentGraph() {
  const { data, isLoading, error } = useContentGraph();
  const isMobile = useIsMobile();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [explore, setExplore] = useState<{ type: string; id: string; title: string } | null>(null);

  const snapshot = data ?? { nodes: [], edges: [], generated_at: '' };

  const selectedEdge: GraphEdgeStat | null = useMemo(
    () => (selectedEdgeId ? snapshot.edges.find((e) => edgeId(e) === selectedEdgeId) ?? null : null),
    [snapshot.edges, selectedEdgeId],
  );

  const selectNode = (type: string | null) => { setSelectedType(type); setSelectedEdgeId(null); };
  const selectEdge = (id: string | null) => { setSelectedEdgeId(id); setSelectedType(null); };

  const generatedNote = snapshot.generated_at
    ? `Snapshot ${new Date(snapshot.generated_at).toLocaleString()} · rebuilt nightly`
    : undefined;

  return (
    <div className="flex flex-col gap-4 p-6">
      <AdminPageHeader
        title="Content Graph"
        subtitle="How every content type and attribute links together. Node size = record count; edge thickness = real link count."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend />
        {generatedNote && <span className="text-2xs text-muted-foreground">{generatedNote}</span>}
      </div>

      {error && (
        <div role="alert" className="rounded-container border border-border p-8 text-center text-13 text-muted-foreground">
          Could not load the content graph. You may not have admin access.
        </div>
      )}

      {isLoading && (
        <div className="h-[560px] rounded-container border border-border bg-muted/20 animate-pulse" aria-hidden="true" />
      )}

      {!isLoading && !error && isMobile && (
        <div className="grid grid-cols-2 gap-4">
          {snapshot.nodes.map((n) => {
            const Icon = typeMeta(n.type).icon;
            return (
              <div key={n.type} className="rounded-container border border-border p-4">
                <div className="flex items-center gap-2">
                  <Icon size={15} className="text-muted-foreground" aria-hidden="true" />
                  <span className="text-13 font-medium">{n.label}</span>
                </div>
                <div className="text-title font-display tabular-nums mt-1">{nf.format(n.count)}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {n.orphan_count != null && n.orphan_count > 0 && (
                    <Badge variant="destructive" className="text-2xs px-1 py-0 tabular-nums">{nf.format(n.orphan_count)} orphan</Badge>
                  )}
                  {n.dup_count > 0 && (
                    <Badge variant="secondary" className="text-2xs px-1 py-0 tabular-nums">{nf.format(n.dup_count)} dup</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !error && !isMobile && (
        <div
          className="flex gap-4"
          style={{ height: 'calc(100vh - 240px)', minHeight: 560 }}
        >
          <div className="flex-1 min-w-0 rounded-container border border-border overflow-hidden">
            <OntologyMap
              nodes={snapshot.nodes}
              edges={snapshot.edges}
              selectedType={selectedType}
              selectedEdge={selectedEdgeId}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
            />
          </div>
          <aside className="w-80 shrink-0 overflow-y-auto rounded-container border border-border p-4">
            <GraphDetailPanel
              snapshot={snapshot}
              selectedType={selectedType}
              selectedEdge={selectedEdge}
              onExplore={setExplore}
            />
          </aside>
        </div>
      )}

      <Dialog open={!!explore} onOpenChange={(o) => !o && setExplore(null)}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Waypoints size={18} aria-hidden="true" />
              {explore?.title}
            </DialogTitle>
          </DialogHeader>
          {explore && (
            <div className="flex-1 min-h-0">
              <EntityEgoExplorer center={explore} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
