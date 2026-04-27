/**
 * CMSEditorLayout
 * Two-column editor layout for CMS content editing.
 * Main column (70%): field group tabs with rendered fields in card containers.
 * Sidebar (30%): WorkflowPanel, SEOPanel, MediaPanel, RevisionPanel (via EditorSidebar).
 * Header: sticky content type icon + label, title, Save/Reset/Close buttons (via EditorHeader).
 * Features: Ctrl/Cmd+S save shortcut, required-field progress bar, dark-mode aware.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Badge from '@mui/material/Badge';
import LinearProgress from '@mui/material/LinearProgress';
import { FileText, List, MapPin, Image, Search, Settings, Heart, ExternalLink } from 'lucide-react';
import { useCMSEditor } from '@/hooks/useCMSEditor';
import {
  getContentType,
  getFieldsByGroup,
  getFieldGroups,
  fieldGroupLabels,
} from '@/config/contentTypeRegistry';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { EditorHeader } from './EditorHeader';
import { EditorSidebar } from './EditorSidebar';
import { AIAssistDrawer } from '@/components/cms/AIAssistDrawer';
import Button from '@mui/material/Button';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FieldGroup } from '@/types/cms';
import { brandColors } from '@/theme/muiTheme';

/** Map field groups to Lucide icons for tab labels */
const fieldGroupIcons: Record<FieldGroup, React.ElementType> = {
  basic: FileText,
  details: List,
  location: MapPin,
  media: Image,
  seo: Search,
  settings: Settings,
  lgbtq: Heart,
  external: ExternalLink,
};

/** Map field groups to dot colors */
const fieldGroupColors: Record<FieldGroup, string> = {
  basic: '#3b82f6',
  details: brandColors.main,
  location: '#10b981',
  media: '#f59e0b',
  seo: '#06b6d4',
  settings: '#6b7280',
  lgbtq: '#ec4899',
  external: '#94a3b8',
};

interface CMSEditorLayoutProps {
  contentType: string;
  itemId: string | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export function CMSEditorLayout({ contentType, itemId, onClose, onSaved }: CMSEditorLayoutProps) {
  const config = getContentType(contentType);

  const { state, setField, setFields, save, reset, setActiveGroup, metadata, updateMetadata } =
    useCMSEditor({ contentType, itemId });

  // Field groups for tab navigation
  const fieldGroups = useMemo(() => getFieldGroups(contentType), [contentType]);

  // Precompute field counts per group
  const fieldCountsByGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of fieldGroups) {
      counts[group] = getFieldsByGroup(contentType, group).length;
    }
    return counts;
  }, [contentType, fieldGroups]);

  // Current group's fields
  const activeFields = useMemo(
    () => getFieldsByGroup(contentType, state.activeGroup),
    [contentType, state.activeGroup],
  );

  // Current tab index
  const activeTabIndex = fieldGroups.indexOf(state.activeGroup);

  // Required fields progress (% filled)
  const requiredProgress = useMemo(() => {
    if (!config) return 100;
    const requiredFields = config.fields.filter((f) => f.required && !f.hidden);
    if (requiredFields.length === 0) return 100;
    const filled = requiredFields.filter((f) => {
      const val = state.data[f.name];
      if (val === null || val === undefined || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    });
    return Math.round((filled.length / requiredFields.length) * 100);
  }, [config, state.data]);

  // ── Enrichment ────────────────────────────────────────────
  const [isEnriching, setIsEnriching] = useState(false);

  const handleEnrich = useCallback(async () => {
    if (!state.itemId || !config) return;
    setIsEnriching(true);
    try {
      const baseArgs = {
        content_type: contentType,
        record_id: state.itemId,
        source: state.data as Record<string, unknown>,
      };
      const [summaryRes, seoRes] = await Promise.all([
        supabase.functions.invoke('cms-ai', { body: { op: 'summarize', ...baseArgs } }),
        supabase.functions.invoke('cms-ai', { body: { op: 'seo_draft', ...baseArgs } }),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      if (seoRes.error) throw seoRes.error;

      const updates: Record<string, unknown> = {};
      const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');
      const summary = summaryRes.data?.output as string | undefined;
      const seo = seoRes.data?.output as { meta_title?: string; meta_description?: string } | undefined;

      const descField = config.fields.find((f) => f.name === 'description' && !f.readOnly && !f.hidden);
      const excerptField = config.fields.find((f) => f.name === 'excerpt' && !f.readOnly && !f.hidden);
      if (summary && descField && isEmpty(state.data.description)) updates.description = summary;
      else if (summary && excerptField && isEmpty(state.data.excerpt)) updates.excerpt = summary;

      const metaTitleField = config.fields.find((f) => f.name === 'meta_title' && !f.readOnly && !f.hidden);
      const metaDescField = config.fields.find((f) => f.name === 'meta_description' && !f.readOnly && !f.hidden);
      if (seo?.meta_title && metaTitleField && isEmpty(state.data.meta_title)) updates.meta_title = seo.meta_title;
      if (seo?.meta_description && metaDescField && isEmpty(state.data.meta_description))
        updates.meta_description = seo.meta_description;

      const count = Object.keys(updates).length;
      if (count > 0) {
        setFields(updates);
        toast.success(`AI filled ${count} field${count > 1 ? 's' : ''}`);
      } else {
        toast.info('Content already looks good — no changes suggested');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Enrichment failed: ${msg}`);
    } finally {
      setIsEnriching(false);
    }
  }, [state.itemId, contentType, config, state.data, setFields]);

  // Handle save
  const handleSave = useCallback(async () => {
    const success = await save();
    if (success && onSaved && state.itemId) {
      onSaved(state.itemId);
    }
  }, [save, onSaved, state.itemId]);

  // Bridge global CMS shortcuts to local editor handlers (CMSShell dispatches
  // these so it can own ⌘K/⌘S/⌘Enter without holding editor refs).
  useEffect(() => {
    const onSaveEvt = () => {
      if (state.isDirty && !state.isSaving) handleSave();
    };
    const onPublishEvt = () => {
      // Fall back to save when no explicit publish action is wired here;
      // the WorkflowPanel owns the actual state transition.
      if (state.isDirty && !state.isSaving) handleSave();
    };
    window.addEventListener('cms:editor:save', onSaveEvt);
    window.addEventListener('cms:editor:publish', onPublishEvt);
    return () => {
      window.removeEventListener('cms:editor:save', onSaveEvt);
      window.removeEventListener('cms:editor:publish', onPublishEvt);
    };
  }, [handleSave, state.isDirty, state.isSaving]);

  // Handle tab change
  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: number) => {
      const group = fieldGroups[newValue];
      if (group) {
        setActiveGroup(group);
      }
    },
    [fieldGroups, setActiveGroup],
  );

  // Curried field change handler
  const handleFieldChange = useCallback(
    (fieldName: string) => (value: unknown) => {
      setField(fieldName, value);
    },
    [setField],
  );

  // ── AI Assist drawer ────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const aiEnabled = Boolean(config?.aiAssist?.ops?.length);
  const handleAiApply = useCallback(
    (field: string, value: unknown) => {
      setField(field, value);
      toast.success(`AI applied to ${field}`);
    },
    [setField],
  );

  // ── Error / Loading states ───────────────────────────────────────

  if (!config) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
        }}
      >
        <Alert severity="error">
          Unknown content type: <strong>{contentType}</strong>
        </Alert>
      </Box>
    );
  }

  if (state.isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
          p: 4,
        }}
      >
        <CircularProgress size={40} aria-label="Loading" />
        <Typography variant="body2" color="text.secondary">
          Loading {config.label.singular.toLowerCase()}...
        </Typography>
      </Box>
    );
  }

  if (state.errors._load) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
        }}
      >
        <Alert severity="error">{state.errors._load}</Alert>
      </Box>
    );
  }

  // Color for progress bar based on completion
  const progressColor =
    requiredProgress === 100 ? '#22c55e' : requiredProgress >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <Box
      className="scale-in"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.default',
      }}
    >
      {/* ── Sticky Header ──────────────────────────────────────── */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          flexShrink: 0,
        }}
      >
        <EditorHeader
          contentType={config}
          state={state}
          onSave={handleSave}
          onReset={reset}
          onClose={onClose}
          onEnrich={handleEnrich}
          isEnriching={isEnriching}
        />

        {/* ── Progress bar ─────────────────────────────────────── */}
        <Box
          sx={{
            position: 'relative',
            height: 3,
            bgcolor: 'divider',
          }}
        >
          <LinearProgress
            variant="determinate"
            value={requiredProgress}
            sx={{
              height: 3,
              bgcolor: 'transparent',
              '& .MuiLinearProgress-bar': {
                bgcolor: progressColor,
                transition: 'transform 0.4s ease, background-color 0.4s ease',
              },
            }}
          />
        </Box>
      </Box>

      {/* ── Error banners ───────────────────────────────────── */}
      {state.errors._conflict && (
        <Alert severity="warning" sx={{ mx: 2, mt: 1.5 }}>
          {state.errors._conflict}
        </Alert>
      )}
      {state.errors._save && (
        <Alert severity="error" sx={{ mx: 2, mt: 1.5 }}>
          {state.errors._save}
        </Alert>
      )}

      {/* ── Body (main + sidebar) ───────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
        }}
      >
        {/* ── Main Column ─────────────────────────────────── */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            width: { lg: '70%' },
            maxWidth: { lg: '70%' },
          }}
        >
          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              m: 2,
              mb: { xs: 1, lg: 2 },
              borderColor: 'divider',
              bgcolor: 'background.paper',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            {/* Group tabs */}
            <MuiTabs
              value={activeTabIndex >= 0 ? activeTabIndex : 0}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                borderBottom: 1,
                borderColor: 'divider',
                minHeight: 48,
                bgcolor: 'background.paper',
                '& .MuiTab-root': {
                  minHeight: 48,
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  gap: 0.75,
                  px: 2,
                },
                '& .MuiTabs-indicator': {
                  height: 2.5,
                  borderRadius: '2px 2px 0 0',
                },
              }}
            >
              {fieldGroups.map((group) => {
                const GroupIcon = fieldGroupIcons[group];
                const count = fieldCountsByGroup[group] ?? 0;
                const dotColor = fieldGroupColors[group];

                return (
                  <MuiTab
                    key={group}
                    label={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                        }}
                      >
                        <GroupIcon
                          style={{
                            width: 15,
                            height: 15,
                            color: dotColor,
                            flexShrink: 0,
                          }}
                        />
                        <span>{fieldGroupLabels[group] || group}</span>
                        <Badge
                          badgeContent={count}
                          sx={{
                            '& .MuiBadge-badge': {
                              position: 'static',
                              transform: 'none',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              minWidth: 18,
                              height: 18,
                              borderRadius: '9px',
                              bgcolor: 'action.selected',
                              color: 'text.secondary',
                              lineHeight: '18px',
                            },
                          }}
                        />
                      </Box>
                    }
                  />
                );
              })}
            </MuiTabs>

            {/* Field grid */}
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{
                  display: 'grid',
                  gap: { xs: 2, sm: 2.5 },
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                  },
                }}
              >
                {activeFields.map((field) => (
                  <Box
                    key={field.name}
                    sx={{
                      gridColumn: field.colSpan === 2 ? '1 / -1' : undefined,
                    }}
                  >
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: state.errors[field.name] ? 'error.main' : 'divider',
                        bgcolor: 'background.default',
                        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                        '&:focus-within': {
                          borderColor: 'primary.main',
                          boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}20`,
                        },
                      }}
                    >
                      <FieldRenderer
                        field={field}
                        value={state.data[field.name]}
                        onChange={handleFieldChange(field.name)}
                        error={state.errors[field.name]}
                        disabled={state.isSaving}
                        setFields={setFields}
                        allValues={state.data}
                      />
                    </Box>
                  </Box>
                ))}

                {activeFields.length === 0 && (
                  <Box
                    sx={{
                      gridColumn: '1 / -1',
                      py: 6,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No fields in this group.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>

        {/* ── Sidebar ─────────────────────────────────────── */}
        <Box
          sx={{
            overflow: 'auto',
            width: { lg: '30%' },
            minWidth: { lg: 300 },
            maxWidth: { lg: 400 },
            borderTop: { xs: '1px solid', lg: 'none' },
            borderLeft: { xs: 'none', lg: '1px solid' },
            borderColor: 'divider',
          }}
        >
          <EditorSidebar
            contentType={contentType}
            itemId={state.itemId ?? itemId}
            metadata={metadata}
            onUpdateMetadata={updateMetadata}
          />
        </Box>
      </Box>

      {aiEnabled && (
        <>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setAiOpen(true)}
            startIcon={<Sparkles size={16} />}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 30,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: 4,
            }}
          >
            AI Assist
          </Button>
          {config && (
            <AIAssistDrawer
              open={aiOpen}
              onClose={() => setAiOpen(false)}
              config={config}
              recordId={state.itemId ?? itemId ?? 'new'}
              source={state.data}
              onApply={handleAiApply}
            />
          )}
        </>
      )}
    </Box>
  );
}
