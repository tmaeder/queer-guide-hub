import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, ArrowUpRight, ExternalLink, Search, Waypoints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useContentGraphRecordSearch } from '@/hooks/useContentGraph';
import {
  EDGE_KIND_LABEL, typeMeta, type ContentGraphSnapshot, type GraphEdgeStat, type GraphNodeStat,
} from './contentGraphMeta';

const nf = new Intl.NumberFormat('en-US');

interface Props {
  snapshot: ContentGraphSnapshot;
  selectedType: string | null;
  selectedEdge: GraphEdgeStat | null;
  onExplore: (center: { type: string; id: string; title: string }) => void;
}

function EdgeRow({ e, dir }: { e: GraphEdgeStat; dir: 'out' | 'in' }) {
  const other = dir === 'out' ? e.target : e.source;
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-13">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="text-muted-foreground">{e.relation}</span>
        <ArrowRight size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium truncate">{other}</span>
      </span>
      <span className="tabular-nums text-muted-foreground shrink-0">{nf.format(e.count)}</span>
    </div>
  );
}

function RecordPicker({ type, onExplore }: { type: string; onExplore: Props['onExplore'] }) {
  const meta = typeMeta(type);
  const [q, setQ] = useState('');
  const { data, isFetching } = useContentGraphRecordSearch(type, q);

  if (!meta.table) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${type} records…`}
          className="pl-8 h-9"
        />
      </div>
      {q.trim().length >= 2 && (
        <div className="flex flex-col rounded-element border border-border divide-y divide-border max-h-64 overflow-y-auto">
          {isFetching && <span className="px-4 py-2 text-13 text-muted-foreground">Searching…</span>}
          {!isFetching && (data?.length ?? 0) === 0 && (
            <span className="px-4 py-2 text-13 text-muted-foreground">No matches.</span>
          )}
          {data?.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onExplore({ type, id: row.id, title: row[meta.titleCol] || type })}
              className="flex items-center justify-between gap-2 px-4 py-2 text-left text-13 hover:bg-muted/50 transition-colors"
            >
              <span className="truncate">{row[meta.titleCol] || '(untitled)'}</span>
              <Waypoints size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GraphDetailPanel({ snapshot, selectedType, selectedEdge, onExplore }: Props) {
  const node: GraphNodeStat | null = useMemo(
    () => (selectedType ? snapshot.nodes.find((n) => n.type === selectedType) ?? null : null),
    [snapshot.nodes, selectedType],
  );
  const { outbound, inbound, selfRels } = useMemo(() => {
    if (!selectedType) return { outbound: [], inbound: [], selfRels: [] as GraphEdgeStat[] };
    const outbound: GraphEdgeStat[] = [];
    const inbound: GraphEdgeStat[] = [];
    const selfRels: GraphEdgeStat[] = [];
    for (const e of snapshot.edges) {
      if (e.source === selectedType && e.target === selectedType) selfRels.push(e);
      else if (e.source === selectedType) outbound.push(e);
      else if (e.target === selectedType) inbound.push(e);
    }
    return { outbound, inbound, selfRels };
  }, [snapshot.edges, selectedType]);

  if (selectedEdge) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Relationship</span>
          <div className="flex items-center gap-2 mt-1 text-title font-display">
            <span>{selectedEdge.source}</span>
            <ArrowRight size={16} aria-hidden="true" />
            <span>{selectedEdge.target}</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-13">
          <div><dt className="text-muted-foreground">Relation</dt><dd className="font-medium">{selectedEdge.relation}</dd></div>
          <div><dt className="text-muted-foreground">Class</dt><dd className="font-medium">{EDGE_KIND_LABEL[selectedEdge.relation_kind]}</dd></div>
          <div className="col-span-2"><dt className="text-muted-foreground">Links</dt><dd className="text-headline font-display tabular-nums">{nf.format(selectedEdge.count)}</dd></div>
        </dl>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-6 text-muted-foreground">
        <Waypoints size={22} aria-hidden="true" />
        <p className="text-13">Select a type or relationship to inspect it.</p>
      </div>
    );
  }

  const meta = typeMeta(node.type);
  const Icon = meta.icon;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon size={18} aria-hidden="true" />
        <h2 className="text-title font-display">{node.label}</h2>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-element border border-border py-2">
          <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Total</dt>
          <dd className="text-title font-display tabular-nums">{nf.format(node.count)}</dd>
        </div>
        <div className="rounded-element border border-border py-2">
          <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Orphans</dt>
          <dd className="text-title font-display tabular-nums">{node.orphan_count == null ? '—' : nf.format(node.orphan_count)}</dd>
        </div>
        <div className="rounded-element border border-border py-2">
          <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Dupes</dt>
          <dd className="text-title font-display tabular-nums">{nf.format(node.dup_count)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={meta.adminHref}><ExternalLink size={14} className="mr-1.5" />Open admin</Link>
        </Button>
        {node.dup_count > 0 && (
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/duplicates"><ArrowUpRight size={14} className="mr-1.5" />Review duplicates</Link>
          </Button>
        )}
      </div>

      {selfRels.length > 0 && (
        <div>
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Self-relations</span>
          {selfRels.map((e) => (
            <div key={e.relation} className="flex items-center justify-between py-1 text-13">
              <span className="text-muted-foreground">{e.relation}</span>
              <span className="tabular-nums text-muted-foreground">{nf.format(e.count)}</span>
            </div>
          ))}
        </div>
      )}

      {outbound.length > 0 && (
        <div>
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Links out</span>
          {outbound.map((e) => <EdgeRow key={`o-${e.target}-${e.relation}`} e={e} dir="out" />)}
        </div>
      )}
      {inbound.length > 0 && (
        <div>
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Links in</span>
          {inbound.map((e) => <EdgeRow key={`i-${e.source}-${e.relation}`} e={e} dir="in" />)}
        </div>
      )}

      {meta.table && (
        <div className="border-t border-border pt-4">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Explore a record</span>
          <p className="text-13 text-muted-foreground mb-2">Open the structural graph around one {node.type}.</p>
          <RecordPicker type={node.type} onExplore={onExplore} />
        </div>
      )}
    </div>
  );
}
