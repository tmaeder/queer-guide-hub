/**
 * EditorSidebar - Right sidebar with collapsible panels.
 * Renders stacked panels: WorkflowPanel, SEOPanel, MediaPanel, RevisionPanel.
 * Each panel is collapsible with Accordion-like UI.
 */

import { useState, useEffect } from 'react';
import { ChevronDown, FileText, Clock, Loader2 } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { WorkflowPanel } from './WorkflowPanel';
import { SEOPanel } from './SEOPanel';
import { useCMSRevisions } from '@/hooks/useCMSRevisions';
import { useCMSMedia } from '@/hooks/useCMSMedia';
import { getContentType } from '@/config/contentTypeRegistry';
import type { CMSContentMetadata, CMSRevision, CMSMediaAttachment } from '@/types/cms';
import { cn } from '@/lib/utils';

interface EditorSidebarProps {
  contentType: string;
  itemId: string | null;
  metadata: CMSContentMetadata | null;
  onUpdateMetadata: (updates: Partial<CMSContentMetadata>) => Promise<void>;
}

interface PanelProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: number;
  children: React.ReactNode;
}

function Panel({ title, open, onOpenChange, badge, children }: PanelProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="border border-border rounded-element overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full min-h-11 flex items-center justify-between px-4 py-2 hover:bg-muted text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{title}</span>
              {badge !== undefined && badge > 0 && (
                <Badge variant="secondary" className="h-5 text-[0.7rem] font-semibold px-1.5">
                  {badge}
                </Badge>
              )}
            </div>
            <ChevronDown
              className={cn('transition-transform', open && 'rotate-180')}
              style={{ width: 18, height: 18 }}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 pt-0">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function EditorSidebar({
  contentType,
  itemId,
  metadata,
  onUpdateMetadata,
}: EditorSidebarProps) {
  const config = getContentType(contentType);

  // Accordion expanded states
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    workflow: true,
    seo: false,
    media: false,
    revisions: false,
  });

  // Revisions hook
  const {
    revisions,
    loading: revisionsLoading,
    loadRevisions,
  } = useCMSRevisions();

  // Media hook
  const {
    loading: mediaLoading,
    getAttachments,
  } = useCMSMedia();

  const [attachments, setAttachments] = useState<CMSMediaAttachment[]>([]);

  // Load revisions and media when panel opens
  useEffect(() => {
    if (expandedPanels.revisions && itemId && config) {
      loadRevisions(config.tableName, itemId);
    }
  }, [expandedPanels.revisions, itemId, config, loadRevisions]);

  useEffect(() => {
    if (expandedPanels.media && itemId && config) {
      getAttachments(config.tableName, itemId).then(setAttachments);
    }
  }, [expandedPanels.media, itemId, config, getAttachments]);

  const setPanel = (panel: string) => (open: boolean) => {
    setExpandedPanels((prev) => ({ ...prev, [panel]: open }));
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Workflow Panel */}
      <Panel title="Workflow" open={expandedPanels.workflow} onOpenChange={setPanel('workflow')}>
        <WorkflowPanel contentType={contentType} itemId={itemId} />
      </Panel>

      {/* SEO Panel */}
      <Panel title="SEO" open={expandedPanels.seo} onOpenChange={setPanel('seo')}>
        <SEOPanel metadata={metadata} onUpdate={onUpdateMetadata} />
      </Panel>

      {/* Media Panel */}
      <Panel
        title="Media"
        open={expandedPanels.media}
        onOpenChange={setPanel('media')}
        badge={attachments.length}
      >
        {!itemId ? (
          <p className="text-sm text-muted-foreground">
            Save the item first to manage media attachments.
          </p>
        ) : mediaLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="animate-spin" size={24} aria-label="Loading" />
          </div>
        ) : attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No media attached. Use the media fields in the editor to add images.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 p-2 rounded-element bg-muted/40 border border-border"
              >
                {att.media?.mime_type?.startsWith('image/') ? (
                  <img
                    src={att.media.storage_path}
                    alt={att.media.original_filename}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="flex items-center justify-center flex-shrink-0 bg-muted rounded w-10 h-10">
                    <FileText className="text-muted-foreground" style={{ width: 16, height: 16 }} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium block overflow-hidden text-ellipsis whitespace-nowrap">
                    {att.media?.original_filename ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">{att.media_role}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Revisions Panel */}
      <Panel
        title="Revisions"
        open={expandedPanels.revisions}
        onOpenChange={setPanel('revisions')}
        badge={revisions.length}
      >
        {!itemId ? (
          <p className="text-sm text-muted-foreground">
            Save the item first to see revision history.
          </p>
        ) : revisionsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="animate-spin" size={24} aria-label="Loading" />
          </div>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No revisions yet. Changes will be tracked after the first save.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-64 overflow-auto">
            {revisions.map((rev) => (
              <RevisionEntry key={rev.id} revision={rev} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Revision Entry ─────────────────────────────────────────────────

function RevisionEntry({ revision }: { revision: CMSRevision }) {
  const date = formatRevisionDate(revision.created_at);
  const authorName = revision.author?.display_name || revision.author?.email || 'System';

  return (
    <div className="flex items-start gap-2 p-2 rounded-element hover:bg-muted/40 transition-colors">
      <div className="flex items-center justify-center flex-shrink-0 mt-0.5 rounded-full bg-muted w-7 h-7">
        <Clock className="text-muted-foreground" style={{ width: 14, height: 14 }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold">#{revision.revision_number}</span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
        {revision.change_summary && (
          <p className="text-xs text-muted-foreground block overflow-hidden text-ellipsis whitespace-nowrap">
            {revision.change_summary}
          </p>
        )}
        <p className="text-muted-foreground" style={{ fontSize: '0.65rem' }}>
          by {authorName}
        </p>
      </div>
    </div>
  );
}

// ── Utility ──────────────────────────────────────────────────────────

function formatRevisionDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}
