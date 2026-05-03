import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listFromWhere } from '@/hooks/usePageFetchers';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useSecureRoleManagement } from '@/hooks/useSecureRoleManagement';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

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
import {
  X,
  MapPin,
  Calendar,
  Clock,
  User as UserIcon,
  Shield,
  Trash2,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { brandColors } from '@/theme/brandColors';

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
  const [_selectedRole, setSelectedRole] = useState<string>('');
  const [fullProfile, setFullProfile] = useState<Record<string, unknown> | null>(null);

  const displayName = user?.display_name || user?.first_name || 'Anonymous';

  useEffect(() => {
    if (user && open) {
      fetchUserRoles();
      fetchFullProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchUserRoles/fetchFullProfile/user are stable, re-run on user_id/open change
  }, [user?.user_id, open]);

  const fetchUserRoles = async () => {
    if (!user) return;
    setRolesLoading(true);
    try {
      const data = await listFromWhere<{ role: AppRole }>('user_roles', 'role', [
        { col: 'user_id', val: user.user_id },
      ]);
      setUserRoles(data.map((r) => r.role));
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchFullProfile = async () => {
    if (!user) return;
    const rows = await listFromWhere<{
      bio: string | null;
      gender_identity: string | null;
      pronouns: string | null;
      sexual_orientation: string | null;
      location: string | null;
      date_of_birth: string | null;
    }>(
      'profiles',
      'bio, gender_identity, pronouns, sexual_orientation, location, date_of_birth',
      [{ col: 'user_id', val: user.user_id }],
    );
    setFullProfile(rows[0] ?? null);
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[520px] p-6 overflow-y-auto">
          <Button
            variant="ghost"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 h-7 w-7 p-0 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Header */}
          <div className="flex items-center gap-4 mb-6 pr-8">
            <Avatar className="h-14 w-14">
              <AvatarImage src={user.avatar_url ?? undefined} alt={displayName} />
              <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{displayName}</h2>
              {user.pronouns && (
                <p className="text-sm text-muted-foreground">{user.pronouns}</p>
              )}
              <div className="flex gap-1 mt-1 flex-wrap">
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
              </div>
            </div>
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="moderation">Moderation</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <div className="flex flex-col gap-4 mt-2">
                {fullProfile?.bio !== undefined && fullProfile?.bio !== null && (
                  <div>
                    <span className="text-xs text-muted-foreground">Bio</span>
                    <p className="text-sm mt-1">{fullProfile.bio as string}</p>
                  </div>
                )}

                <div className="border-t border-border" />

                <InfoRow icon={MapPin} label="Location" value={user.location} />
                <InfoRow icon={UserIcon} label="Mode" value={user.user_mode} />
                <InfoRow
                  icon={UserIcon}
                  label="Gender Identity"
                  value={fullProfile?.gender_identity as string | null | undefined}
                />
                <InfoRow
                  icon={UserIcon}
                  label="Sexual Orientation"
                  value={fullProfile?.sexual_orientation as string | null | undefined}
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

                <div className="border-t border-border" />

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Profile Completion</span>
                  <span className="text-sm font-semibold">
                    {user.profile_completion_percentage ?? 0}%
                  </span>
                </div>

                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-[width] duration-300"
                    style={{ width: `${user.profile_completion_percentage ?? 0}%` }}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Roles Tab */}
            <TabsContent value="roles">
              <div className="flex flex-col gap-4 mt-2">
                <span className="text-sm text-muted-foreground">Current Roles</span>

                {rolesLoading ? (
                  <Skeleton className="w-full h-10" />
                ) : userRoles.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Standard user (no special roles)
                  </p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
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
                  </div>
                )}

                {isAdmin && availableRoles.length > 0 && (
                  <>
                    <div className="border-t border-border" />
                    <span className="text-sm text-muted-foreground">Add Role</span>
                    <div className="flex gap-2 flex-wrap">
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
                    </div>
                  </>
                )}

                {!isAdmin && (
                  <span className="text-xs text-muted-foreground mt-2">
                    Only admins can manage roles.
                  </span>
                )}
              </div>
            </TabsContent>

            {/* Moderation Tab */}
            <TabsContent value="moderation">
              <div className="mt-2">
                <UserModerationActions
                  userId={user.user_id}
                  currentStatus={
                    (user.moderation_status as 'approved' | 'suspended' | 'banned') ?? 'approved'
                  }
                  displayName={displayName}
                  onStatusChanged={handleModerationChanged}
                />
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

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
    <div className="flex items-center gap-3">
      <Icon style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
      <span className="text-sm text-muted-foreground min-w-[120px]">{label}</span>
      <span className="text-sm font-medium">{value || '-'}</span>
    </div>
  );
}
