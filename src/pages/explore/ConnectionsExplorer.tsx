import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Edge } from '@xyflow/react';
import { Waypoints, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEgoNetwork, egoKey, type EgoNode } from '@/hooks/useEgoNetwork';
import { detailHref } from '@/lib/searchRoutes';
import EgoGraph from '@/components/explore/EgoGraph';
import type { EgoFlowNode } from '@/components/explore/EntityNode';

function nodeHref(n: EgoNode): string | null {
  return detailHref({ type: n.type, slug: n.slug, id: n.id, title: n.title });
}

function placeOf(n: EgoNode): string | undefined {
  return n.city && n.country ? `${n.city}, ${n.country}` : n.city || n.country || undefined;
}

export default function ConnectionsExplorer() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const isMobile = useIsMobile();

  const type = params.get('type');
  const id = params.get('id');
  const title = params.get('title') || undefined;

  useMeta({
    title: `${t('connections.title')} · queer.guide`,
    description: t('connections.subtitle'),
  });

  const center = useMemo(
    () => (type && id ? { type, id, title } : null),
    [type, id, title],
  );

  const { nodes, edges, expand, error } = useEgoNetwork(center);

  const flowNodes = useMemo((): EgoFlowNode[] =>
    Object.values(nodes).map(n => ({
      id: n.key,
      type: 'entityNode' as const,
      position: n.position,
      draggable: n.depth > 0,
      data: {
        title: n.title,
        entityType: n.type,
        category: n.category,
        place: placeOf(n),
        imageUrl: n.imageUrl,
        href: nodeHref(n),
        isCenter: n.depth === 0,
        expanded: n.expanded,
        loading: n.loading,
      },
    })), [nodes]);

  const flowEdges = useMemo((): Edge[] =>
    edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'straight',
      style: {
        strokeWidth: Math.max(1, e.score * 3),
        opacity: Math.min(0.9, 0.25 + e.score * 0.6),
      },
    })), [edges]);

  const recenter = (n: EgoNode) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('type', n.type);
      next.set('id', n.id);
      next.set('title', n.title);
      return next;
    });
  };

  if (!center) {
    return (
      <div className="container mx-auto px-4 py-12">
        <EmptyState
          icon={Waypoints}
          title={t('connections.emptyTitle')}
          description={t('connections.emptyDescription')}
        >
          <Button asChild variant="outline">
            <LocalizedLink to="/search">
              <Search className="h-4 w-4 mr-2" />
              {t('connections.emptyCta')}
            </LocalizedLink>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const nodeList = Object.values(nodes);
  const centerNode = nodes[egoKey(center.type, center.id)];
  const related = nodeList.filter(n => n.depth > 0).sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    // Definite height (not min-height): React Flow sizes itself 100% of its
    // parent, which must resolve — flex-1 under an indefinite parent yields a
    // zero-height, non-interactive pane.
    <div
      className="container mx-auto px-4 py-6 flex flex-col gap-4"
      style={{ height: isMobile ? undefined : 'max(640px, calc(100vh - 120px))' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Waypoints className="h-5 w-5" aria-hidden="true" />
        <h1 className="text-title font-semibold">{t('connections.title')}</h1>
        {centerNode && (
          <Badge variant="outline" className="text-xs">
            {centerNode.title}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {t('connections.stats', { nodes: nodeList.length, links: edges.length })}
        </span>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        {isMobile ? t('connections.mobileHint') : t('connections.hint')}
      </p>

      {error && related.length === 0 && (
        <div role="alert" className="text-sm text-muted-foreground border border-border rounded-element p-6 text-center">
          {t('connections.error')}
        </div>
      )}

      {isMobile ? (
        <div className="grid grid-cols-2 gap-4">
          {related.map(n => {
            const href = nodeHref(n);
            return (
              <Card key={n.key}>
                <CardContent className="p-4 flex flex-col gap-2">
                  <span className="text-sm font-medium leading-tight line-clamp-2">{n.title}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-3xs px-1 py-0">{n.type}</Badge>
                    {placeOf(n) && <span className="text-2xs text-muted-foreground truncate">{placeOf(n)}</span>}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => recenter(n)}>
                      {t('connections.recenter')}
                    </Button>
                    {href && (
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                        <LocalizedLink to={href}>{t('connections.openShort')}</LocalizedLink>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-0 border border-border rounded-container overflow-hidden">
          <EgoGraph nodes={flowNodes} edges={flowEdges} onNodeClick={expand} />
        </div>
      )}
    </div>
  );
}
