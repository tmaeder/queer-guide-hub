/**
 * CMSEditorLayout
 * Two-column editor layout for CMS content editing.
 * Main column (70%): field group tabs with rendered fields in card containers.
 * Sidebar (30%): WorkflowPanel, SEOPanel, MediaPanel, RevisionPanel (via EditorSidebar).
 * Header: sticky content type icon + label, title, Save/Reset/Close buttons (via EditorHeader).
 * Features: Ctrl/Cmd+S save shortcut, required-field progress bar, dark-mode aware.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  List,
  MapPin,
  Image,
  Search,
  Settings,
  Heart,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FieldGroup } from '@/types/cms';
import { brandColors } from '@/theme/brandColors';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  basic: 'hsl(var(--muted-foreground))',
  details: brandColors.main,
  location: 'hsl(var(--foreground))',
  media: 'hsl(var(--foreground) / 0.55)',
  seo: 'hsl(var(--muted-foreground))',
  settings: 'hsl(var(--muted-foreground))',
  lgbtq: 'hsl(var(--foreground))',
  external: 'hsl(var(--muted-foreground))',
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

  const titleValue = (config ? (state.data[config.titleField] as string) : '') ?? '';
  useEffect(() => {
    const prev = document.title;
    const label = config?.label.singular ?? contentType;
    document.title = titleValue
      ? `${titleValue} | Queer Guide`
      : `New ${label} | Queer Guide`;
    return () => {
      document.title = prev;
    };
  }, [titleValue, config, contentType]);

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
      <div className="flex items-center justify-center h-full p-8">
        <Alert variant="destructive">
          <AlertDescription>
            Unknown content type: <strong>{contentType}</strong>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <Loader2 className="h-10 w-10 animate-spin" aria-label="Loading" />
        <p className="text-sm text-muted-foreground">
          Loading {config.label.singular.toLowerCase()}...
        </p>
      </div>
    );
  }

  if (state.errors._load) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Alert variant="destructive">
          <AlertDescription>{state.errors._load}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Color for progress bar based on completion
  const progressColor =
    requiredProgress === 100 ? 'hsl(var(--foreground))' : requiredProgress >= 60 ? 'hsl(var(--foreground) / 0.55)' : 'hsl(var(--destructive))';

  return (
    <div className="scale-in flex flex-col h-full bg-background">
      {/* ── Sticky Header ──────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex-shrink-0">
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
        <div className="relative h-[3px] bg-border">
          <div
            className="h-[3px] transition-all duration-400 ease-in-out"
            style={{
              width: `${requiredProgress}%`,
              backgroundColor: progressColor,
            }}
          />
        </div>
      </div>

      {/* ── Error banners ───────────────────────────────────── */}
      {state.errors._conflict && (
        <Alert className="mx-3 mt-3 border-yellow-500 text-yellow-700">
          <AlertDescription>{state.errors._conflict}</AlertDescription>
        </Alert>
      )}
      {state.errors._save && (
        <Alert variant="destructive" className="mx-3 mt-3">
          <AlertDescription>{state.errors._save}</AlertDescription>
        </Alert>
      )}

      {/* ── Body (main + sidebar) ───────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* ── Main Column ─────────────────────────────────── */}
        <div className="flex-1 overflow-auto lg:w-[70%] lg:max-w-[70%]">
          <div className="border border-border rounded-element bg-background m-3 mb-1 lg:mb-3 overflow-hidden">
            {/* Group tabs */}
            <Tabs
              value={state.activeGroup}
              onValueChange={(v) => setActiveGroup(v as FieldGroup)}
            >
              <TabsList className="border-b border-border min-h-12 bg-background w-full justify-start overflow-x-auto">
                {fieldGroups.map((group) => {
                  const GroupIcon = fieldGroupIcons[group];
                  const count = fieldCountsByGroup[group] ?? 0;
                  const dotColor = fieldGroupColors[group];

                  return (
                    <TabsTrigger
                      key={group}
                      value={group}
                      className="min-h-12 normal-case font-medium text-sm gap-1.5 px-3"
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
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-muted text-muted-foreground text-[0.65rem] font-bold leading-[18px] px-1">
                        {count}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            {/* Field grid */}
            <div className="p-3 sm:p-6">
              <div className="grid gap-3 sm:gap-5 grid-cols-1 sm:grid-cols-2">
                {activeFields.map((field) => (
                  <div
                    key={field.name}
                    style={{
                      gridColumn: field.colSpan === 2 ? '1 / -1' : undefined,
                    }}
                  >
                    <div
                      className={`p-3 rounded-element border bg-background transition-colors focus-within:border-primary focus-within:shadow-[0_0_0_2px_hsl(var(--primary)/0.2)] ${
                        state.errors[field.name] ? 'border-destructive' : 'border-border'
                      }`}
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
                    </div>
                  </div>
                ))}

                {activeFields.length === 0 && (
                  <div className="col-span-full py-12 text-center">
                    <p className="text-sm text-muted-foreground">No fields in this group.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────── */}
        <div className="overflow-auto lg:w-[30%] lg:min-w-[300px] lg:max-w-[400px] border-t lg:border-t-0 lg:border-l border-border">
          <EditorSidebar
            contentType={contentType}
            itemId={state.itemId ?? itemId}
            metadata={metadata}
            onUpdateMetadata={updateMetadata}
          />
        </div>
      </div>

      {aiEnabled && (
        <>
          <Button
            onClick={() => setAiOpen(true)}
            className="fixed bottom-6 right-6 z-30 normal-case font-semibold shadow-lg"
          >
            <Sparkles size={16} className="mr-1" />
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
    </div>
  );
}
