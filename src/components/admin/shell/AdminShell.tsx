/**
 * AdminShell -- Main layout wrapper for the unified admin console.
 * Replaces CMSShell with route-based navigation via react-router-dom Outlet.
 *
 * Features:
 * - Sidebar (persistent on desktop, drawer on mobile)
 * - Breadcrumbs bar derived from current route
 * - Content area rendered via <Outlet />
 * - Editor overlay support via React context (any child can open the CMS editor)
 * - Negative margins to break out of App.tsx Container maxWidth
 */

import { useState, useCallback, useEffect, lazy, Suspense, createContext, useContext } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { Menu, ChevronRight } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getBreadcrumbsForRoute } from '@/config/adminNavigation';

// ── Editor Context ────────────────────────────────────────────────────────────

interface EditorContext {
  contentType: string;
  itemId: string | null;
}

interface AdminShellContextValue {
  openEditor: (contentType: string, itemId: string | null) => void;
  closeEditor: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AdminShellContext = createContext<AdminShellContextValue>({
  openEditor: () => {},
  closeEditor: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminShell(): AdminShellContextValue {
  return useContext(AdminShellContext);
}

// ── Lazy-load the CMS editor ─────────────────────────────────────────────────

const CMSEditorLayout = lazy(() =>
  import('@/components/cms/editor/CMSEditorLayout').then((m) => ({
    default: m.CMSEditorLayout,
  })),
);

// ── Shell Skeleton ───────────────────────────────────────────────────────────

/** Skeleton loading placeholder that mimics the sidebar + content layout */
function ShellSkeleton() {
  return (
    <div className="flex w-full" style={{ minHeight: 'var(--admin-content-min-h)' }}>
      {/* Skeleton sidebar */}
      <div className="hidden md:block w-[260px] flex-shrink-0 border-r border-border bg-background p-4">
        <Skeleton className="rounded w-40 h-6 mb-2" />
        <Skeleton className="w-24 h-4 mb-6" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 mb-2">
            <Skeleton className="rounded-none w-7 h-7" />
            <Skeleton className="h-5" style={{ width: 80 + Math.random() * 60 }} />
          </div>
        ))}
      </div>

      {/* Skeleton main content */}
      <div className="flex-1 p-6">
        <Skeleton className="w-[200px] h-8 mb-2" />
        <Skeleton className="w-[300px] h-5 mb-6" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AdminShell() {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Editor overlay state
  const [editor, setEditor] = useState<EditorContext | null>(null);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const openEditor = useCallback((contentType: string, itemId: string | null) => {
    setEditor({ contentType, itemId });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor(null);
  }, []);

  const handleEditorSaved = useCallback((_id: string) => {
    // Stay on editor after save -- child can navigate if desired
  }, []);

  // Build breadcrumbs from current route
  const breadcrumbs = getBreadcrumbsForRoute(location.pathname);

  // Sidebar component
  const sidebar = <AdminSidebar />;

  return (
    <AdminShellContext.Provider value={{ openEditor, closeEditor }}>
      <a
        href="#admin-main-content"
        className="absolute -left-[9999px] top-2 z-[2000] px-4 py-2 bg-background text-foreground no-underline font-semibold focus:left-2 focus:outline-2 focus:outline-[hsl(var(--foreground))]"
      >
        Skip to admin content
      </a>
      <div
        className="flex w-full bg-muted/30"
        style={{ minHeight: 'var(--admin-content-min-h)' }}
      >
        {/* Mobile hamburger with "Admin Console" label */}
        {isMobile && (
          <button
            type="button"
            aria-label="Open admin navigation"
            onClick={() => setMobileOpen(true)}
            className="fixed flex items-center gap-1.5 bg-background pl-2 pr-3 py-1.5 cursor-pointer"
            style={{ top: 80, left: 8, zIndex: 1200 }}
          >
            <Button variant="ghost" size="sm" className="h-7 w-7 p-1">
              <Menu size={18} />
            </Button>
            <span className="font-semibold text-xs text-muted-foreground whitespace-nowrap">
              Admin Console
            </span>
          </button>
        )}

        {/* Sidebar -- drawer on mobile, persistent on desktop */}
        {isMobile ? (
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-[260px] p-0">
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
            <div className="px-4 sm:px-6 py-2.5 bg-background border-b border-border flex items-center min-h-[44px]">
              <nav aria-label="Breadcrumb">
                <ol className="flex items-center flex-nowrap">
                  {breadcrumbs.map((crumb, i) => {
                    const isLast = i === breadcrumbs.length - 1;
                    return (
                      <li key={i} className="flex items-center">
                        {i > 0 && (
                          <span className="mx-1.5">
                            <ChevronRight size={14} className="text-muted-foreground" />
                          </span>
                        )}
                        {isLast ? (
                          <span
                            className="font-semibold text-[0.82rem] text-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px] sm:max-w-[300px] md:max-w-[500px] inline-block"
                          >
                            {crumb.label}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => crumb.route && navigate(crumb.route)}
                            className="font-medium text-[0.82rem] text-muted-foreground cursor-pointer whitespace-nowrap hover:underline hover:text-[hsl(var(--foreground))] bg-transparent border-0 p-0"
                          >
                            {crumb.label}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>
          )}

          {/* Content area */}
          <main id="admin-main-content" tabIndex={-1} className="flex-1 overflow-auto p-4 sm:p-6">
            {/* Editor overlay takes priority when open */}
            {editor ? (
              <Suspense fallback={<ShellSkeleton />}>
                <CMSEditorLayout
                  contentType={editor.contentType}
                  itemId={editor.itemId}
                  onClose={closeEditor}
                  onSaved={handleEditorSaved}
                />
              </Suspense>
            ) : (
              <ErrorBoundary>
                <div key={location.pathname} className="content-enter">
                  <Outlet />
                </div>
              </ErrorBoundary>
            )}
          </main>
        </div>
      </div>
    </AdminShellContext.Provider>
  );
}
