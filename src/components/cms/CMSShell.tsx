/**
 * CMSShell — Main CMS layout container.
 * Sidebar on the left, main content area on the right.
 * Manages navigation state, editor overlay, breadcrumbs, and view transitions.
 * Uses negative margins to break out of the App.tsx Container constraint.
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { Menu, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CMSSidebar, type CMSView } from './CMSSidebar';
import { CMSOverview } from './CMSOverview';
import { ContentListPanel } from './ContentListPanel';
import { ReviewQueue } from './ReviewQueue';
import { MediaLibrary } from './MediaLibrary';
import { CommandPalette } from './CommandPalette';
import { useCMSShortcuts } from '@/hooks/useCMSShortcuts';
import { getContentType } from '@/config/contentTypeRegistry';

// Lazy-load heavy panels
const CMSEditorLayout = lazy(() =>
  import('./editor/CMSEditorLayout').then((m) => ({ default: m.CMSEditorLayout })),
);
const AuditLog = lazy(() =>
  import('./AuditLog').then((m) => ({ default: m.AuditLog })),
);
const DataQualityDashboard = lazy(() =>
  import('./DataQualityDashboard').then((m) => ({ default: m.DataQualityDashboard })),
);
const ModerationQueue = lazy(() =>
  import('./ModerationQueue').then((m) => ({ default: m.ModerationQueue })),
);

interface EditorContext {
  contentType: string;
  itemId: string | null;
}

/** Hook detecting mobile viewport (< 900px) */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 899px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

/** Skeleton loading placeholder that mimics the sidebar + content layout */
function ShellSkeleton() {
  return (
    <div className="flex w-full" style={{ minHeight: 'calc(100vh - 100px)' }}>
      {/* Skeleton sidebar */}
      <div
        className="hidden md:block flex-shrink-0 border-r border-border bg-background p-4"
        style={{ width: 260 }}
      >
        <Skeleton className="rounded-md mb-1" style={{ width: 160, height: 24 }} />
        <Skeleton className="mb-6" style={{ width: 100, height: 16 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 mb-2">
            <Skeleton className="rounded-lg" style={{ width: 28, height: 28 }} />
            <Skeleton style={{ width: 80 + Math.random() * 60, height: 20 }} />
          </div>
        ))}
      </div>

      {/* Skeleton main content */}
      <div className="flex-1 p-6">
        <Skeleton className="mb-1" style={{ width: 200, height: 32 }} />
        <Skeleton className="mb-6" style={{ width: 300, height: 20 }} />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="rounded-xl" style={{ height: 120 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** View label map for breadcrumbs */
const viewLabels: Record<CMSView, string> = {
  overview: 'Dashboard',
  content: 'Content',
  pages: 'Pages',
  media: 'Media Library',
  review: 'Review Queue',
  audit: 'Audit Log',
  settings: 'Settings',
};

export function CMSShell() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Navigation state
  const [activeView, setActiveView] = useState<CMSView>('overview');
  const [activeContentType, setActiveContentType] = useState<string | undefined>();

  // Editor overlay state
  const [editor, setEditor] = useState<EditorContext | null>(null);

  // Command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Transition animation state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleNavigate = useCallback((view: CMSView, contentType?: string) => {
    // Trigger fade-out
    setIsTransitioning(true);

    // Clear any previous timer
    if (transitionTimer.current) clearTimeout(transitionTimer.current);

    transitionTimer.current = setTimeout(() => {
      setActiveView(view);
      setActiveContentType(contentType);
      setEditor(null);

      // Trigger fade-in after state updates
      requestAnimationFrame(() => {
        setIsTransitioning(false);
      });
    }, 150);

    if (isMobile) setMobileOpen(false);
  }, [isMobile]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  const handleEdit = useCallback((contentType: string, itemId: string | null) => {
    setEditor({ contentType, itemId });
    if (isMobile) setMobileOpen(false);
  }, [isMobile]);

  const handleCloseEditor = useCallback(() => {
    setEditor(null);
  }, []);

  const handleEditorSaved = useCallback((_id: string) => {
    // Stay on editor; could optionally navigate back
  }, []);

  // Build breadcrumb segments
  const breadcrumbs: Array<{ label: string; onClick?: () => void }> = [
    { label: 'Content Hub', onClick: () => handleNavigate('overview') },
  ];

  if (editor) {
    const ct = getContentType(editor.contentType);
    breadcrumbs.push({
      label: ct?.label.plural ?? 'Content',
      onClick: () => handleNavigate('content', editor.contentType),
    });
    breadcrumbs.push({
      label: editor.itemId
        ? `Edit ${ct?.label.singular ?? 'Item'}`
        : `New ${ct?.label.singular ?? 'Item'}`,
    });
  } else if (activeView !== 'overview') {
    if (activeView === 'content' && activeContentType) {
      const ct = getContentType(activeContentType);
      breadcrumbs.push({ label: 'Content', onClick: () => handleNavigate('content') });
      breadcrumbs.push({ label: ct?.label.plural ?? activeContentType });
    } else {
      breadcrumbs.push({ label: viewLabels[activeView] });
    }
  }

  // Global keyboard shortcuts. Save/Publish are scoped to the editor and
  // dispatched via custom events the editor listens to (no shared state needed).
  useCMSShortcuts({
    onPalette: () => setPaletteOpen(true),
    onSave: editor
      ? () => window.dispatchEvent(new CustomEvent('cms:editor:save'))
      : undefined,
    onPublish: editor
      ? () => window.dispatchEvent(new CustomEvent('cms:editor:publish'))
      : undefined,
  });

  // Sidebar component
  const sidebar = (
    <CMSSidebar
      activeView={activeView}
      activeContentType={activeContentType}
      onNavigate={handleNavigate}
    />
  );

  // Loading fallback (skeleton)
  const loadingFallback = <ShellSkeleton />;

  // Main content area
  const renderMainContent = () => {
    // If editor is open, show full-screen editor overlay
    if (editor) {
      return (
        <Suspense fallback={loadingFallback}>
          <CMSEditorLayout
            contentType={editor.contentType}
            itemId={editor.itemId}
            onClose={handleCloseEditor}
            onSaved={handleEditorSaved}
          />
        </Suspense>
      );
    }

    switch (activeView) {
      case 'overview':
        return <CMSOverview onNavigate={handleNavigate} onEdit={handleEdit} />;

      case 'content':
        return (
          <ContentListPanel
            contentTypeId={activeContentType}
            onEdit={handleEdit}
            onCreate={(ct) => handleEdit(ct, null)}
          />
        );

      case 'pages':
        return (
          <ContentListPanel
            contentTypeId="cms_pages"
            onEdit={handleEdit}
            onCreate={() => handleEdit('cms_pages', null)}
          />
        );

      case 'media':
        return <MediaLibrary />;

      case 'review':
        return <ReviewQueue onEdit={handleEdit} />;

      case 'audit':
        return (
          <Suspense fallback={loadingFallback}>
            <AuditLog />
          </Suspense>
        );

      case 'quality':
        return (
          <Suspense fallback={loadingFallback}>
            <DataQualityDashboard />
          </Suspense>
        );

      case 'moderation':
        return (
          <Suspense fallback={loadingFallback}>
            <ModerationQueue />
          </Suspense>
        );

      case 'settings':
        return <CMSSettingsPanel />;

      default:
        return null;
    }
  };

  return (
    <div
      className="flex bg-muted/30 -mx-1 sm:-mx-2"
      style={{
        minHeight: 'calc(100vh - 100px)',
        width: 'calc(100% + 16px)',
      }}
    >
      {/* Mobile hamburger with "Content Hub" label */}
      {isMobile && (
        <div
          onClick={() => setMobileOpen(true)}
          className="fixed flex items-center gap-1.5 bg-background rounded-[10px] cursor-pointer transition-shadow"
          style={{
            top: 80,
            left: 8,
            zIndex: 1200,
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            paddingLeft: 8,
            paddingRight: 12,
            paddingTop: 6,
            paddingBottom: 6,
          }}
        >
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Menu size={18} />
          </Button>
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
            Content Hub
          </span>
        </div>
      )}

      {/* Sidebar -- drawer on mobile, persistent on desktop */}
      {isMobile ? (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-[260px]">
            {sidebar}
          </SheetContent>
        </Sheet>
      ) : (
        <div className="flex-shrink-0">{sidebar}</div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Breadcrumb bar */}
        {breadcrumbs.length > 1 && (
          <div className="px-4 sm:px-6 py-[10px] bg-background border-b border-border flex items-center" style={{ minHeight: 44 }}>
            <nav className="flex items-center flex-nowrap">
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <div key={i} className="flex items-center">
                    {i > 0 && (
                      <ChevronRight size={14} style={{ color: '#94a3b8', margin: '0 6px' }} />
                    )}
                    {isLast ? (
                      <span
                        className="font-semibold text-foreground whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{ fontSize: '0.82rem', maxWidth: 500 }}
                      >
                        {crumb.label}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={crumb.onClick}
                        className="font-medium text-muted-foreground cursor-pointer whitespace-nowrap hover:underline hover:text-[hsl(var(--brand))]"
                        style={{ fontSize: '0.82rem' }}
                      >
                        {crumb.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        )}

        {/* Content area with fade transition */}
        <div
          className="flex-1 overflow-auto p-4 sm:p-6"
          style={{
            opacity: isTransitioning ? 0 : 1,
            transform: isTransitioning ? 'translateY(6px)' : 'translateY(0)',
            transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {renderMainContent()}
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={handleNavigate}
        onEdit={handleEdit}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline settings panel (minimal; keeps the shell self-contained)    */
/* ------------------------------------------------------------------ */

function SettingRow({ defaultChecked, label }: { defaultChecked?: boolean; label: string }) {
  const id = `cms-setting-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="flex items-center gap-2">
      <Switch defaultChecked={defaultChecked} id={id} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

function CMSSettingsPanel() {
  return (
    <div>
      <h5 className="text-2xl font-bold mb-1">Settings</h5>
      <p className="text-sm text-muted-foreground mb-6">CMS configuration</p>

      <div className="flex flex-col gap-4">
        <div className="border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">Content Settings</p>
          <div className="flex flex-col gap-2">
            <SettingRow defaultChecked label="Auto-save drafts" />
            <SettingRow label="Require review before publish" />
            <SettingRow defaultChecked label="Enable revision history" />
          </div>
        </div>

        <div className="border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">Media Settings</p>
          <div className="flex flex-col gap-2">
            <SettingRow defaultChecked label="Compress images on upload" />
            <SettingRow defaultChecked label="Generate thumbnails" />
          </div>
        </div>

        <div className="border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">SEO Settings</p>
          <div className="flex flex-col gap-2">
            <SettingRow defaultChecked label="Auto-generate meta descriptions" />
            <SettingRow defaultChecked label="Generate XML sitemap" />
          </div>
        </div>
      </div>
    </div>
  );
}
