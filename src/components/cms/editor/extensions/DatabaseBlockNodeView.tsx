import { useCallback } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DatabaseViewController } from '@/components/content/database-block/DatabaseViewController';
import {
  MAX_SNAPSHOT_ENTRIES,
  sanitizeBlockAttrs,
  type BlockViewState,
  type SnapshotEntry,
} from '@/lib/databaseBlock/schema';
import type { EntityCard } from '@/lib/databaseBlock/normalize';

/**
 * Editor-side chrome around the shared view controller.
 *
 * View-state changes go straight to updateAttributes, so whatever the author
 * leaves the block looking like becomes the default every reader sees.
 */
export function DatabaseBlockNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  // Attributes come from a document that may have been hand-edited or round-
  // tripped through HTML, so normalize before handing them to the renderer.
  const attrs = sanitizeBlockAttrs(node.attrs);

  const handleViewStateChange = useCallback(
    (next: BlockViewState) => updateAttributes({ viewState: next }),
    [updateAttributes],
  );

  /**
   * Persist a trimmed snapshot so `body_html` carries real, crawlable links.
   *
   * Gated entities are already filtered out upstream by the view controller;
   * sanitizeSnapshot enforces it again on the way in, and returns empty for a
   * query block whose membership is dynamic.
   */
  const handleCardsResolved = useCallback(
    (cards: EntityCard[]) => {
      const next: SnapshotEntry[] = cards.slice(0, MAX_SNAPSHOT_ENTRIES).map((card) => ({
        t: card.entityType,
        id: card.entityId,
        s: card.href ? card.href.split('/').pop() ?? null : null,
        n: card.title,
      }));

      const current = JSON.stringify(node.attrs.snapshot ?? []);
      if (JSON.stringify(next) === current) return; // avoid a transaction loop
      updateAttributes({ snapshot: next });
    },
    [node.attrs.snapshot, updateAttributes],
  );

  return (
    <NodeViewWrapper
      className={cn(
        'my-6 border border-border bg-background rounded-container p-4',
        selected && 'ring-2 ring-ring',
      )}
      data-block-id={attrs.blockId}
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">
          {attrs.entityType.replace('_', ' ')}
          {attrs.source.kind === 'query' ? ' · live query' : ' · selected'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={deleteNode}
          aria-label="Remove this block"
          // contentEditable=false keeps ProseMirror from treating chrome clicks
          // as document edits.
          contentEditable={false}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div contentEditable={false}>
        <DatabaseViewController
          blockId={attrs.blockId}
          entityType={attrs.entityType}
          source={attrs.source}
          viewState={attrs.viewState}
          onViewStateChange={handleViewStateChange}
          onCardsResolved={handleCardsResolved}
        />
      </div>
    </NodeViewWrapper>
  );
}
