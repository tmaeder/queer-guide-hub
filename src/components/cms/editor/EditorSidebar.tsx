/**
 * EditorSidebar - Right sidebar with collapsible panels.
 * Renders stacked panels: WorkflowPanel, SEOPanel, MediaPanel, RevisionPanel.
 * Each panel is collapsible with Accordion-like UI.
 */

import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { ChevronDown, FileText, Clock } from 'lucide-react';
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

  const handleAccordionChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedPanels((prev) => ({ ...prev, [panel]: isExpanded }));
  };

  const accordionSx = {
    '&:before': { display: 'none' },
    boxShadow: 'none',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: '8px !important',
    overflow: 'hidden',
    '&.Mui-expanded': {
      margin: 0,
    },
  };

  const summarySx = {
    minHeight: 44,
    '&.Mui-expanded': { minHeight: 44 },
    '& .MuiAccordionSummary-content': {
      margin: '8px 0',
      '&.Mui-expanded': { margin: '8px 0' },
    },
  };

  return (
    <Box className="p-4 flex flex-col gap-3">
      {/* Workflow Panel */}
      <Accordion
        expanded={expandedPanels.workflow}
        onChange={handleAccordionChange('workflow')}
        sx={accordionSx}
      >
        <AccordionSummary
          expandIcon={<ChevronDown style={{ width: 18, height: 18 }} />}
          sx={summarySx}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Workflow
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <WorkflowPanel
            contentType={contentType}
            itemId={itemId}
          />
        </AccordionDetails>
      </Accordion>

      {/* SEO Panel */}
      <Accordion
        expanded={expandedPanels.seo}
        onChange={handleAccordionChange('seo')}
        sx={accordionSx}
      >
        <AccordionSummary
          expandIcon={<ChevronDown style={{ width: 18, height: 18 }} />}
          sx={summarySx}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            SEO
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <SEOPanel
            metadata={metadata}
            onUpdate={onUpdateMetadata}
          />
        </AccordionDetails>
      </Accordion>

      {/* Media Panel */}
      <Accordion
        expanded={expandedPanels.media}
        onChange={handleAccordionChange('media')}
        sx={accordionSx}
      >
        <AccordionSummary
          expandIcon={<ChevronDown style={{ width: 18, height: 18 }} />}
          sx={summarySx}
        >
          <Box className="flex items-center gap-2">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Media
            </Typography>
            {attachments.length > 0 && (
              <Chip
                label={attachments.length}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
              />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {!itemId ? (
            <Typography variant="body2" color="text.secondary">
              Save the item first to manage media attachments.
            </Typography>
          ) : mediaLoading ? (
            <Box className="flex items-center justify-center py-4">
              <CircularProgress size={24} />
            </Box>
          ) : attachments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No media attached. Use the media fields in the editor to add images.
            </Typography>
          ) : (
            <Box className="flex flex-col gap-2">
              {attachments.map((att) => (
                <Box
                  key={att.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md',
                    'bg-gray-50 border border-gray-100',
                  )}
                >
                  {att.media?.mime_type?.startsWith('image/') ? (
                    <Box
                      component="img"
                      src={att.media.storage_path}
                      alt={att.media.original_filename}
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 1,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <Box
                      className="flex items-center justify-center flex-shrink-0 bg-gray-200 rounded"
                      sx={{ width: 40, height: 40 }}
                    >
                      <FileText style={{ width: 16, height: 16, color: '#6b7280' }} />
                    </Box>
                  )}
                  <Box className="min-w-0 flex-1">
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 500,
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {att.media?.original_filename ?? 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {att.media_role}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </AccordionDetails>
      </Accordion>

      {/* Revisions Panel */}
      <Accordion
        expanded={expandedPanels.revisions}
        onChange={handleAccordionChange('revisions')}
        sx={accordionSx}
      >
        <AccordionSummary
          expandIcon={<ChevronDown style={{ width: 18, height: 18 }} />}
          sx={summarySx}
        >
          <Box className="flex items-center gap-2">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Revisions
            </Typography>
            {revisions.length > 0 && (
              <Chip
                label={revisions.length}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
              />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {!itemId ? (
            <Typography variant="body2" color="text.secondary">
              Save the item first to see revision history.
            </Typography>
          ) : revisionsLoading ? (
            <Box className="flex items-center justify-center py-4">
              <CircularProgress size={24} />
            </Box>
          ) : revisions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No revisions yet. Changes will be tracked after the first save.
            </Typography>
          ) : (
            <Box className="flex flex-col gap-1.5 max-h-64 overflow-auto">
              {revisions.map((rev) => (
                <RevisionEntry key={rev.id} revision={rev} />
              ))}
            </Box>
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

// ── Revision Entry ─────────────────────────────────────────────────

function RevisionEntry({ revision }: { revision: CMSRevision }) {
  const date = formatRevisionDate(revision.created_at);
  const authorName = revision.author?.display_name || revision.author?.email || 'System';

  return (
    <Box
      className={cn(
        'flex items-start gap-2 p-2 rounded-md',
        'hover:bg-gray-50 transition-colors',
      )}
    >
      <Box
        className="flex items-center justify-center flex-shrink-0 mt-0.5 rounded-full bg-gray-100"
        sx={{ width: 28, height: 28 }}
      >
        <Clock style={{ width: 14, height: 14, color: '#6b7280' }} />
      </Box>
      <Box className="min-w-0 flex-1">
        <Box className="flex items-center gap-1.5">
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            #{revision.revision_number}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {date}
          </Typography>
        </Box>
        {revision.change_summary && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {revision.change_summary}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          by {authorName}
        </Typography>
      </Box>
    </Box>
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
