/**
 * CMSSidebar — Persistent left navigation for the CMS.
 * Groups: Dashboard, Content (per content type), Pages, Media, Review Queue, Audit Log, Settings.
 * Features: gradient header, colored icon badges, count badges, user info footer,
 * smooth collapse animation, section labels, hover micro-animations.
 */

import { useMemo, useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import {
  LayoutDashboard,
  ChevronDown,
  FileText,
  Image,
  ClipboardCheck,
  History,
  Activity,
  ShieldAlert,
  Settings,
  LogOut,
  Layers,
} from 'lucide-react';
import { getContentTypeIds, getContentType } from '@/config/contentTypeRegistry';
import { countRows } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';
import { brandColors } from '@/theme/muiTheme';

export type CMSView =
  | 'overview'
  | 'content'
  | 'pages'
  | 'media'
  | 'review'
  | 'quality'
  | 'moderation'
  | 'audit'
  | 'settings';

interface CMSSidebarProps {
  activeView: CMSView;
  activeContentType?: string;
  onNavigate: (view: CMSView, contentType?: string) => void;
  /** Counts per content type for badges (overrides auto-loaded counts) */
  contentCounts?: Record<string, number>;
  /** Items in review */
  reviewCount?: number;
}

/** Tiny uppercase section label */
function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: 'block',
        px: 2.5,
        pt: 2,
        pb: 0.5,
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: 'text.disabled',
        userSelect: 'none',
      }}
    >
      {children}
    </Typography>
  );
}

/** Colored circle icon wrapper matching EditorHeader style */
function IconBadge({
  icon: Icon,
  color,
  size = 16,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  size?: number;
}) {
  return (
    <Box
      sx={{
        width: 28,
        height: 28,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: color + '18',
        color: color,
        flexShrink: 0,
        transition: 'background-color 0.2s ease',
      }}
    >
      <Icon size={size} />
    </Box>
  );
}

/** Styled nav item with left border indicator + hover micro-animation */
const navItemSx = (isActive: boolean, accentColor?: string) => ({
  borderRadius: '8px',
  mx: 0.75,
  mb: 0.25,
  py: 0.75,
  pl: isActive ? 1.5 : 1.75,
  position: 'relative' as const,
  transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  bgcolor: isActive
    ? (accentColor ? accentColor + '10' : 'action.selected')
    : 'transparent',
  borderLeft: isActive
    ? `3px solid ${accentColor || brandColors.main}`
    : '3px solid transparent',
  '&:hover': {
    bgcolor: isActive
      ? (accentColor ? accentColor + '14' : 'action.selected')
      : 'action.hover',
    transform: 'translateX(2px)',
  },
  '&.Mui-selected': {
    bgcolor: accentColor ? accentColor + '10' : 'action.selected',
    '&:hover': {
      bgcolor: accentColor ? accentColor + '14' : 'action.selected',
    },
  },
});

/** Count badge chip */
function CountBadge({ count, color }: { count: number | undefined; color?: string }) {
  if (count === undefined) return null;
  return (
    <Chip
      label={count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
      size="small"
      sx={{
        height: 20,
        fontSize: '0.65rem',
        fontWeight: 600,
        minWidth: 28,
        bgcolor: color ? color + '14' : 'action.hover',
        color: color || 'text.secondary',
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );
}

export function CMSSidebar({
  activeView,
  activeContentType,
  onNavigate,
  contentCounts: externalCounts,
  reviewCount = 0,
}: CMSSidebarProps) {
  const [contentOpen, setContentOpen] = useState(true);
  const [loadedCounts, setLoadedCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  const { user } = useAuth();

  const contentTypes = useMemo(() => {
    return getContentTypeIds()
      .filter((id) => id !== 'cms_pages')
      .map((id) => getContentType(id)!)
      .filter(Boolean);
  }, []);

  // Load content counts from Supabase on mount
  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const counts: Record<string, number> = {};
      const promises = contentTypes.map(async (ct) => {
        try {
          counts[ct.id] = await countRows(ct.tableName);
        } catch {
          // Silently skip tables that fail
        }
      });
      await Promise.all(promises);
      setLoadedCounts(counts);
    } catch {
      // Fail gracefully
    } finally {
      setCountsLoading(false);
    }
  }, [contentTypes]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Use external counts if provided, otherwise use loaded counts
  const contentCounts = externalCounts ?? loadedCounts;

  // Extract user display info
  const userEmail = user?.email ?? '';
  const userDisplayName =
    (user?.user_metadata?.display_name as string) ||
    (user?.user_metadata?.first_name as string) ||
    userEmail.split('@')[0] ||
    'User';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  return (
    <Box
      sx={{
        width: 260,
        minHeight: '100%',
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Gradient Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2.5,
          background: `linear-gradient(135deg, ${brandColors.main}14 0%, ${brandColors.light}0A 50%, transparent 100%)`,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '10px',
              background: `linear-gradient(135deg, ${brandColors.main}, ${brandColors.light})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: `0 2px 8px ${brandColors.main}4D`,
            }}
          >
            <Layers size={16} color="#fff" />
          </Box>
          <Box>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                background: `linear-gradient(135deg, ${brandColors.main}, ${brandColors.main})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Content Hub
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
              Manage all content
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Scrollable nav area */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {/* WORKSPACE section */}
        <SectionLabel>Workspace</SectionLabel>

        <List component="nav" disablePadding>
          {/* Dashboard */}
          <ListItemButton
            selected={activeView === 'overview'}
            onClick={() => onNavigate('overview')}
            sx={navItemSx(activeView === 'overview', brandColors.main)}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={LayoutDashboard} color="hsl(var(--brand))" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Dashboard"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'overview' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
          </ListItemButton>

          {/* Content types collapsible */}
          <ListItemButton
            onClick={() => setContentOpen(!contentOpen)}
            sx={{
              borderRadius: '8px',
              mx: 0.75,
              mb: 0.25,
              py: 0.75,
              transition: 'all 0.15s ease',
              '&:hover': {
                transform: 'translateX(2px)',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Box
                sx={{
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: contentOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronDown size={16} />
              </Box>
            </ListItemIcon>
            <ListItemText
              primary="Content"
              primaryTypographyProps={{ variant: 'body2', fontWeight: 600, fontSize: '0.85rem' }}
            />
            {!countsLoading && (
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', fontSize: '0.65rem', fontWeight: 500 }}
              >
                {contentTypes.length} types
              </Typography>
            )}
          </ListItemButton>

          <Collapse
            in={contentOpen}
            timeout={300}
            easing={{
              enter: 'cubic-bezier(0.4, 0, 0.2, 1)',
              exit: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <List component="div" disablePadding>
              {/* "All Content" */}
              <ListItemButton
                selected={activeView === 'content' && !activeContentType}
                onClick={() => onNavigate('content')}
                sx={{
                  ...navItemSx(activeView === 'content' && !activeContentType, brandColors.main),
                  pl: activeView === 'content' && !activeContentType ? 4.5 : 4.75,
                  py: 0.5,
                }}
              >
                <ListItemText
                  primary="All Content"
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: activeView === 'content' && !activeContentType ? 600 : 400,
                    fontSize: '0.82rem',
                  }}
                />
              </ListItemButton>

              {contentTypes.map((ct) => {
                const Icon = ct.icon;
                const isActive = activeView === 'content' && activeContentType === ct.id;
                const count = contentCounts[ct.id];
                return (
                  <ListItemButton
                    key={ct.id}
                    selected={isActive}
                    onClick={() => onNavigate('content', ct.id)}
                    sx={{
                      ...navItemSx(isActive, ct.color),
                      pl: isActive ? 3.25 : 3.5,
                      py: 0.5,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <IconBadge icon={Icon} color={ct.color} size={14} />
                    </ListItemIcon>
                    <ListItemText
                      primary={ct.label.plural}
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: isActive ? 600 : 400,
                        fontSize: '0.82rem',
                      }}
                    />
                    {countsLoading ? (
                      <Skeleton variant="rounded" width={28} height={18} sx={{ borderRadius: '9px' }} />
                    ) : (
                      <CountBadge count={count} color={ct.color} />
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          </Collapse>
        </List>

        {/* TOOLS section */}
        <SectionLabel>Tools</SectionLabel>

        <List component="nav" disablePadding>
          {/* Pages */}
          <ListItemButton
            selected={activeView === 'pages'}
            onClick={() => onNavigate('pages')}
            sx={navItemSx(activeView === 'pages', '#64748b')}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={FileText} color="#64748b" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Pages"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'pages' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
          </ListItemButton>

          {/* Media Library */}
          <ListItemButton
            selected={activeView === 'media'}
            onClick={() => onNavigate('media')}
            sx={navItemSx(activeView === 'media', '#3b82f6')}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={Image} color="#3b82f6" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Media Library"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'media' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
          </ListItemButton>

          {/* Review Queue */}
          <ListItemButton
            selected={activeView === 'review'}
            onClick={() => onNavigate('review')}
            sx={navItemSx(activeView === 'review', '#f59e0b')}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={ClipboardCheck} color="#f59e0b" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Review Queue"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'review' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
            {reviewCount > 0 && (
              <Chip
                label={reviewCount}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  minWidth: 24,
                  bgcolor: '#fef3c7',
                  color: '#92400e',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </ListItemButton>

          {/* Data Quality */}
          <ListItemButton
            selected={activeView === 'quality'}
            onClick={() => onNavigate('quality')}
            sx={navItemSx(activeView === 'quality', '#10b981')}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={Activity} color="#10b981" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Data Quality"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'quality' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
          </ListItemButton>

          {/* Moderation */}
          <ListItemButton
            selected={activeView === 'moderation'}
            onClick={() => onNavigate('moderation')}
            sx={navItemSx(activeView === 'moderation', '#ef4444')}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={ShieldAlert} color="#ef4444" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Moderation"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'moderation' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
          </ListItemButton>

          {/* Audit Log */}
          <ListItemButton
            selected={activeView === 'audit'}
            onClick={() => onNavigate('audit')}
            sx={navItemSx(activeView === 'audit', '#6366f1')}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={History} color="#6366f1" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Audit Log"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'audit' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
          </ListItemButton>

          <Divider sx={{ my: 0.75, mx: 1.5 }} />

          {/* Settings */}
          <ListItemButton
            selected={activeView === 'settings'}
            onClick={() => onNavigate('settings')}
            sx={navItemSx(activeView === 'settings', '#64748b')}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <IconBadge icon={Settings} color="#64748b" size={15} />
            </ListItemIcon>
            <ListItemText
              primary="Settings"
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: activeView === 'settings' ? 600 : 400,
                fontSize: '0.85rem',
              }}
            />
          </ListItemButton>
        </List>
      </Box>

      {/* User info footer */}
      <Box
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: 'grey.50',
        }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            fontSize: '0.8rem',
            fontWeight: 600,
            bgcolor: brandColors.main,
            color: '#fff',
          }}
          src={user?.user_metadata?.avatar_url as string | undefined}
        >
          {userInitial}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {userDisplayName}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'text.disabled',
              fontSize: '0.65rem',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
          >
            {userEmail}
          </Typography>
        </Box>
        <Tooltip title="Sign out">
          <Box
            component="button"
            onClick={() => supabase.auth.signOut()}
            sx={{
              p: 0.5,
              borderRadius: '6px',
              border: 'none',
              bgcolor: 'transparent',
              color: 'text.disabled',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s ease',
              '&:hover': {
                bgcolor: 'action.hover',
                color: 'text.secondary',
              },
            }}
          >
            <LogOut size={14} />
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );
}
