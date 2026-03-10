/**
 * AdminSidebar -- Unified left navigation for the admin console.
 * Sections: Dashboard, Content, Imports & Data, Review & Workflow, System.
 * Features: gradient header, colored icon badges, count badges, user info footer,
 * smooth collapse animation, section labels, hover micro-animations, admin-only filtering.
 *
 * Uses react-router-dom navigation (useNavigate / useLocation) instead of
 * the old callback-based onNavigate pattern from CMSSidebar.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
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
import { ChevronDown, LogOut, Layers, Shield } from 'lucide-react';

import { adminNavSections } from '@/config/adminNavigation';
import type { AdminNavItem } from '@/config/adminNavigation';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

// ── Sub-components ───────────────────────────────────────────────

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

/** Styled nav item sx with left border indicator + hover micro-animation */
const navItemSx = (isActive: boolean, accentColor?: string) => ({
  borderRadius: '8px',
  mx: 0.75,
  mb: 0.25,
  py: 0.75,
  pl: isActive ? 1.5 : 1.75,
  position: 'relative' as const,
  transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  bgcolor: isActive ? (accentColor ? accentColor + '10' : 'action.selected') : 'transparent',
  borderLeft: isActive ? `3px solid ${accentColor || '#8b5cf6'}` : '3px solid transparent',
  '&:hover': {
    bgcolor: isActive ? (accentColor ? accentColor + '14' : 'action.selected') : 'action.hover',
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

// ── Props ────────────────────────────────────────────────────────

interface AdminSidebarProps {
  /** Override counts per table (optional) */
  contentCounts?: Record<string, number>;
}

// ── Component ────────────────────────────────────────────────────

export function AdminSidebar({ contentCounts: externalCounts }: AdminSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();

  // Section expand/collapse state, seeded from defaultExpanded in config
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of adminNavSections) {
      initial[section.id] = section.defaultExpanded ?? true;
    }
    return initial;
  });

  const [loadedCounts, setLoadedCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);

  // ── Load all counts from Supabase via single RPC ────────────
  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const { data, error } = await api.rpc('get_admin_counts');
      if (!error && data) {
        const raw = data as Record<string, number>;
        // Map table names back to nav item IDs
        const counts: Record<string, number> = {};
        for (const section of adminNavSections) {
          for (const item of section.items) {
            if (item.countTable && raw[item.countTable] !== undefined) {
              counts[item.id] = raw[item.countTable];
            }
          }
        }
        setLoadedCounts(counts);
      }
    } catch {
      // Fail gracefully
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Merge external overrides with loaded counts
  const mergedCounts = useMemo(() => {
    if (externalCounts) {
      return { ...loadedCounts, ...externalCounts };
    }
    return loadedCounts;
  }, [externalCounts, loadedCounts]);

  // ── Route matching ────────────────────────────────────────────
  const isItemActive = useCallback(
    (item: AdminNavItem): boolean => {
      const pathname = location.pathname;
      // Exact match for the /admin root route
      if (item.route === '/admin') {
        return pathname === '/admin';
      }
      // Prefix match for all other routes
      return pathname.startsWith(item.route);
    },
    [location.pathname],
  );

  // ── Filter admin-only items when user is not admin ────────────
  const filterItems = useCallback(
    (items: AdminNavItem[]): AdminNavItem[] => {
      if (isAdmin) return items;
      return items.filter((item) => !item.adminOnly);
    },
    [isAdmin],
  );

  // ── Toggle section ────────────────────────────────────────────
  const toggleSection = (sectionId: string) => {
    setSectionOpen((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  // ── User display info ─────────────────────────────────────────
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
      {/* ── Gradient Header ─────────────────────────────────────── */}
      <Box
        sx={{
          px: 2.5,
          py: 2.5,
          background:
            'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(168, 85, 247, 0.04) 50%, transparent 100%)',
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
              background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
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
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Admin Console
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
              Manage everything
            </Typography>
          </Box>
          {isAdmin && (
            <Tooltip title="Admin role">
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', color: '#8b5cf6' }}>
                <Shield size={14} />
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* ── Scrollable nav area ─────────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {adminNavSections.map((section, sectionIdx) => {
          const filteredItems = filterItems(section.items);

          // Skip entire section if no items after admin filtering
          if (filteredItems.length === 0) return null;

          const isOpen = sectionOpen[section.id] ?? section.defaultExpanded ?? true;

          return (
            <Box key={section.id}>
              {/* Section divider (skip before first section) */}
              {sectionIdx > 0 && <Divider sx={{ my: 0.75, mx: 1.5 }} />}

              {/* Section label + collapse toggle */}
              <ListItemButton
                onClick={() => toggleSection(section.id)}
                sx={{
                  borderRadius: '8px',
                  mx: 0.75,
                  mb: 0.25,
                  py: 0.5,
                  mt: sectionIdx === 0 ? 0.5 : 0,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    transform: 'translateX(2px)',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <Box
                    sx={{
                      transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronDown size={14} />
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={section.label.toUpperCase()}
                  primaryTypographyProps={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'text.disabled',
                  }}
                />
                {!countsLoading && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.disabled',
                      fontSize: '0.6rem',
                      fontWeight: 500,
                    }}
                  >
                    {filteredItems.length}
                  </Typography>
                )}
              </ListItemButton>

              {/* Collapsible items */}
              <Collapse
                in={isOpen}
                timeout={300}
                easing={{
                  enter: 'cubic-bezier(0.4, 0, 0.2, 1)',
                  exit: 'cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <List component="div" disablePadding>
                  {filteredItems.map((item) => {
                    const active = isItemActive(item);
                    const count = mergedCounts[item.id];
                    const hasCount = item.countTable !== undefined;
                    const itemColor = item.color ?? section.color;

                    return (
                      <ListItemButton
                        key={item.id}
                        selected={active}
                        onClick={() => navigate(item.route)}
                        sx={navItemSx(active, itemColor)}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <IconBadge icon={item.icon} color={itemColor} size={15} />
                        </ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{
                            variant: 'body2',
                            fontWeight: active ? 600 : 400,
                            fontSize: '0.85rem',
                          }}
                        />
                        {hasCount &&
                          (countsLoading ? (
                            <Skeleton
                              variant="rounded"
                              width={28}
                              height={18}
                              sx={{ borderRadius: '9px' }}
                            />
                          ) : (
                            <CountBadge count={count} color={itemColor} />
                          ))}
                      </ListItemButton>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      {/* ── User info footer ────────────────────────────────────── */}
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
            bgcolor: '#8b5cf6',
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
            onClick={() => api.auth.signOut()}
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
