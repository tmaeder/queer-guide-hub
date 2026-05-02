/**
 * CMSShell — Main CMS layout container.
 * Sidebar on the left, main content area on the right.
 * Manages navigation state, editor overlay, breadcrumbs, and view transitions.
 * Uses negative margins to break out of the App.tsx Container constraint.
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { Menu, ChevronRight } from 'lucide-react';
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
            <Skeleton variant="rounded" width={28} height={28} sx={{ borderRadius: '8px' }} />
            <Skeleton variant="text" width={80 + Math.random() * 60} height={20} />
          </Box>
        ))}
      </Box>

      {/* Skeleton main content */}
      <Box sx={{ flex: 1, p: 3 }}>
        <Skeleton variant="text" width={200} height={32} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={300} height={20} sx={{ mb: 3 }} />
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: '12px' }} />
          ))}
        </Box>
      </Box>
    </Box>
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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
    <Box
      sx={{
        display: 'flex',
        minHeight: 'calc(100vh - 100px)',
        // Break out of the Container maxWidth="lg" in App.tsx
        mx: { xs: -1, sm: -2 },
        width: { xs: 'calc(100% + 16px)', sm: 'calc(100% + 32px)' },
        bgcolor: 'grey.50',
      }}
    >
      {/* Mobile hamburger with "Content Hub" label */}
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
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            borderRadius: '10px',
            pl: 1,
            pr: 1.5,
            py: 0.75,
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease',
            '&:hover': {
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            },
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
            Content Hub
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
                    onClick={crumb.onClick}
                    sx={{
                      fontWeight: 500,
                      fontSize: '0.82rem',
                      color: 'text.secondary',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      '&:hover': { color: 'hsl(var(--brand))' },
                    }}
                  >
                    {crumb.label}
                  </Link>
                );
              })}
            </Breadcrumbs>
          </Box>
        )}

        {/* Content area with fade transition */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: { xs: 2, sm: 3 },
            opacity: isTransitioning ? 0 : 1,
            transform: isTransitioning ? 'translateY(6px)' : 'translateY(0)',
            transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {renderMainContent()}
        </Box>
      </Box>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={handleNavigate}
        onEdit={handleEdit}
      />
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline settings panel (minimal; keeps the shell self-contained)    */
/* ------------------------------------------------------------------ */

function CMSSettingsPanel() {
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        CMS configuration
      </Typography>

      <Stack spacing={2}>
        <Paper sx={{ p: 2.5, borderRadius: '12px' }} elevation={0} variant="outlined">
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Content Settings
          </Typography>
          <Stack spacing={1}>
            <FormControlLabel control={<Switch defaultChecked />} label="Auto-save drafts" />
            <FormControlLabel control={<Switch />} label="Require review before publish" />
            <FormControlLabel control={<Switch defaultChecked />} label="Enable revision history" />
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: '12px' }} elevation={0} variant="outlined">
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Media Settings
          </Typography>
          <Stack spacing={1}>
            <FormControlLabel control={<Switch defaultChecked />} label="Compress images on upload" />
            <FormControlLabel control={<Switch defaultChecked />} label="Generate thumbnails" />
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: '12px' }} elevation={0} variant="outlined">
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            SEO Settings
          </Typography>
          <Stack spacing={1}>
            <FormControlLabel control={<Switch defaultChecked />} label="Auto-generate meta descriptions" />
            <FormControlLabel control={<Switch defaultChecked />} label="Generate XML sitemap" />
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
