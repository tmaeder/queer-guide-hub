import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useSecureRoleManagement } from '@/hooks/useSecureRoleManagement';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserModerationActions } from './UserModerationActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiDrawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  User as UserIcon,
  Shield,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { brandColors } from '@/theme/muiTheme';

type AppRole = Database['public']['Enums']['app_role'];

interface UserRow {
  id: string;
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  location: string | null;
  user_mode: string | null;
  is_online: boolean | null;
  moderation_status: string;
  profile_completion_percentage: number | null;
  pronouns: string | null;
  created_at: string;
  last_seen_at: string | null;
}

interface UserDetailSheetProps {
  user: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#ef4444',
  moderator: '#f97316',
  editor: '#3b82f6',
  contributor: brandColors.main,
};

const ALL_ROLES: AppRole[] = ['admin', 'moderator', 'editor'];

export function UserDetailSheet({ user, open, onOpenChange, onUserUpdated }: UserDetailSheetProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useAdminRoles();
  const { assignRole, removeRole, loading: roleLoading } = useSecureRoleManagement();
  const [userRoles, setUserRoles] = useState<AppRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [confirmAdminRole, setConfirmAdminRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [fullProfile, setFullProfile] = useState<Record<string, any> | null>(null);

  const displayName = user?.display_name || user?.first_name || 'Anonymous';

  useEffect(() => {
    if (user && open) {
      fetchUserRoles();
      fetchFullProfile();
    }
  }, [user?.user_id, open]);

  const fetchUserRoles = async () => {
    if (!user) return;
    setRolesLoading(true);
    try {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.user_id);
      setUserRoles((data ?? []).map((r) => r.role));
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchFullProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('bio, gender_identity, pronouns, sexual_orientation, location, date_of_birth')
      .eq('user_id', user.user_id)
      .single();
    setFullProfile(data);
  };

  const handleAssignRole = async (role: AppRole) => {
    if (!user) return;
    if (role === 'admin') {
      setSelectedRole(role);
      setConfirmAdminRole(true);
      return;
    }
    await doAssignRole(role);
  };

  const doAssignRole = async (role: AppRole) => {
    if (!user) return;
    const result = await assignRole(user.user_id, role);
    if (result.success) {
      await fetchUserRoles();
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      onUserUpdated();
    }
  };

  const handleRemoveRole = async (role: AppRole) => {
    if (!user) return;
    const result = await removeRole(user.user_id, role);
    if (result.success) {
      await fetchUserRoles();
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      onUserUpdated();
    }
  };

  const availableRoles = ALL_ROLES.filter((r) => !userRoles.includes(r));

  const handleModerationChanged = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'profiles'] });
    queryClient.invalidateQueries({ queryKey: ['admin-user-stats'] });
    onUserUpdated();
  };

  if (!user) return null;

  return (
    <>
      <MuiDrawer
        open={open}
        onClose={() => onOpenChange(false)}
        anchor="right"
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 520 },
            p: 3,
          },
        }}
      >
        <IconButton
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
          size="small"
        >
          <X style={{ width: 16, height: 16 }} />
        </IconButton>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, pr: 4 }}>
          <Avatar style={{ width: 56, height: 56 }}>
            <AvatarImage src={user.avatar_url ?? undefined} alt={displayName} />
            <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {displayName}
            </Typography>
            {user.pronouns && (
              <Typography variant="body2" color="text.secondary">
                {user.pronouns}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              {userRoles.map((role) => (
                <Badge
                  key={role}
                  variant="outline"
                  style={{
                    borderColor: ROLE_COLORS[role],
                    color: ROLE_COLORS[role],
                    fontSize: '0.7rem',
                  }}
                >
                  {role}
                </Badge>
              ))}
              <Badge
                variant={
                  (user.moderation_status ?? 'approved') === 'approved'
                    ? 'default'
                    : (user.moderation_status ?? 'approved') === 'suspended'
                      ? 'secondary'
                      : 'destructive'
                }
                style={{ fontSize: '0.7rem' }}
              >
                {user.moderation_status ?? 'approved'}
              </Badge>
            </Box>
          </Box>
        </Box>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="moderation">Moderation</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {fullProfile?.bio && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Bio
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {fullProfile.bio}
                  </Typography>
                </Box>
              )}

              <Divider />

              <InfoRow icon={MapPin} label="Location" value={user.location} />
              <InfoRow icon={UserIcon} label="Mode" value={user.user_mode} />
              <InfoRow
                icon={UserIcon}
                label="Gender Identity"
                value={fullProfile?.gender_identity}
              />
              <InfoRow
                icon={UserIcon}
                label="Sexual Orientation"
                value={fullProfile?.sexual_orientation}
              />
              <InfoRow
                icon={Calendar}
                label="Joined"
                value={new Date(user.created_at).toLocaleDateString()}
              />
              <InfoRow
                icon={Clock}
                label="Last Seen"
                value={user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : 'Never'}
              />

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Profile Completion
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user.profile_completion_percentage ?? 0}%
                </Typography>
              </Box>

              <Box
                sx={{
                  height: 6,
                  bgcolor: 'action.hover',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: `${user.profile_completion_percentage ?? 0}%`,
                    bgcolor: 'primary.main',
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }}
                />
              </Box>
            </Box>
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Current Roles
              </Typography>

              {rolesLoading ? (
                <Skeleton width="100%" height={40} />
              ) : userRoles.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Standard user (no special roles)
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {userRoles.map((role) => (
                    <Badge
                      key={role}
                      variant="outline"
                      style={{
                        borderColor: ROLE_COLORS[role],
                        color: ROLE_COLORS[role],
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                      }}
                    >
                      <Shield style={{ height: 12, width: 12 }} />
                      {role}
                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveRole(role)}
                          disabled={roleLoading}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            marginLeft: 4,
                            display: 'flex',
                          }}
                        >
                          <Trash2 style={{ height: 10, width: 10, opacity: 0.6 }} />
                        </button>
                      )}
                    </Badge>
                  ))}
                </Box>
              )}

              {isAdmin && availableRoles.length > 0 && (
                <>
                  <Divider />
                  <Typography variant="body2" color="text.secondary">
                    Add Role
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {availableRoles.map((role) => (
                      <Button
                        key={role}
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssignRole(role)}
                        disabled={roleLoading}
                        style={{ textTransform: 'capitalize' }}
                      >
                        + {role}
                      </Button>
                    ))}
                  </Box>
                </>
              )}

              {!isAdmin && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  Only admins can manage roles.
                </Typography>
              )}
            </Box>
          </TabsContent>

          {/* Moderation Tab */}
          <TabsContent value="moderation">
            <Box sx={{ mt: 1 }}>
              <UserModerationActions
                userId={user.user_id}
                currentStatus={
                  (user.moderation_status as 'approved' | 'suspended' | 'banned') ?? 'approved'
                }
                displayName={displayName}
                onStatusChanged={handleModerationChanged}
              />
            </Box>
          </TabsContent>
        </Tabs>
      </MuiDrawer>

      {/* Admin role confirmation dialog */}
      <AlertDialog open={confirmAdminRole} onOpenChange={setConfirmAdminRole}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign Admin Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to grant admin access to "{displayName}"? This gives full system
              access including user management and settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                doAssignRole('admin');
                setConfirmAdminRole(false);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Icon style={{ height: 14, width: 14, color: 'var(--muted-foreground)', flexShrink: 0 }} />
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value || '-'}
      </Typography>
    </Box>
  );
}
