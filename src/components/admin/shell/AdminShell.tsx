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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Menu, ChevronRight } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import { getBreadcrumbsForRoute } from '@/config/adminNavigation';
import { brandColors } from '@/theme/muiTheme';

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
    <Box sx={{ display: 'flex', width: '100%', minHeight: 'calc(100vh - 100px)' }}>
      {/* Skeleton sidebar */}
      <Box
        sx={{
          width: 260,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          p: 2,
          display: { xs: 'none', md: 'block' },
        }}
      >
        <Skeleton variant="rounded" width={160} height={24} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={100} sx={{ mb: 3 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Skeleton variant="rounded" width={28} height={28} sx={{ borderRadius: 0 }} />
            <Skeleton variant="text" width={80 + Math.random() * 60} height={20} />
          </Box>
        ))}
      </Box>

      {/* Skeleton main content */}
      <Box sx={{ flex: 1, p: 3 }}>
        <Skeleton variant="text" width={200} height={32} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={300} height={20} sx={{ mb: 3 }} />
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 0 }} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AdminShell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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
      <Box
        component="a"
        href="#admin-main-content"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 8,
          zIndex: 2000,
          px: 2,
          py: 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          textDecoration: 'none',
          fontWeight: 600,
          '&:focus': { left: 8, outline: `2px solid ${brandColors.main}` },
        }}
      >
        Skip to admin content
      </Box>
      <Box
        sx={{
          display: 'flex',
          minHeight: 'calc(100vh - 100px)',
          width: '100%',
          bgcolor: 'grey.50',
        }}
      >
        {/* Mobile hamburger with "Admin Console" label */}
        {isMobile && (
          <Box
            onClick={() => setMobileOpen(true)}
            sx={{
              position: 'fixed',
              top: 80,
              left: 8,
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              bgcolor: 'background.paper',
              pl: 1,
              pr: 1.5,
              py: 0.75,
              cursor: 'pointer',
            }}
          >
            <IconButton size="small" sx={{ p: 0.5 }}>
              <Menu size={18} />
            </IconButton>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                color: 'text.secondary',
                whiteSpace: 'nowrap',
              }}
            >
              Admin Console
            </Typography>
          </Box>
        )}

        {/* Sidebar -- drawer on mobile, persistent on desktop */}
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: 260 } }}
          >
            {sidebar}
          </Drawer>
        ) : (
          <Box sx={{ flexShrink: 0 }}>{sidebar}</Box>
        )}

        {/* Main content */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Breadcrumb bar */}
          {breadcrumbs.length > 1 && (
            <Box
              sx={{
                px: { xs: 2, sm: 3 },
                py: 1.25,
                bgcolor: 'background.paper',
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                minHeight: 44,
              }}
            >
              <Breadcrumbs
                separator={<ChevronRight size={14} style={{ color: '#94a3b8' }} />}
                sx={{
                  '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
                  '& .MuiBreadcrumbs-separator': { mx: 0.75 },
                }}
              >
                {breadcrumbs.map((crumb, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  if (isLast) {
                    return (
                      <Typography
                        key={i}
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          color: 'text.primary',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: { xs: 150, sm: 300, md: 500 },
                        }}
                      >
                        {crumb.label}
                      </Typography>
                    );
                  }
                  return (
                    <Link
                      key={i}
                      component="button"
                      variant="body2"
                      underline="hover"
                      onClick={() => crumb.route && navigate(crumb.route)}
                      sx={{
                        fontWeight: 500,
                        fontSize: '0.82rem',
                        color: 'text.secondary',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        '&:hover': { color: brandColors.main },
                      }}
                    >
                      {crumb.label}
                    </Link>
                  );
                })}
              </Breadcrumbs>
            </Box>
          )}

          {/* Content area */}
          <Box id="admin-main-content" component="main" tabIndex={-1} sx={{ flex: 1, overflow: 'auto', p: { xs: 2, sm: 3 } }}>
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
              <Box key={location.pathname} className="content-enter">
                <Outlet />
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </AdminShellContext.Provider>
  );
}
