import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, UserPlus, Shield, Eye, MoreHorizontal } from "lucide-react";
import { ExportExcelButton } from "@/components/admin/ExportExcelButton";
import { exportToExcel, fetchAllRows, formatDateTime, generateFilename, type ExportColumnDef } from "@/utils/excelExport";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function AdminUsers() {
  const { isAdmin } = useAdminRoles();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Real user data from database
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);

        // Fetch all profiles first
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          setUsers([]);
          return;
        }

        // Fetch user roles separately for each user
        const userList = await Promise.all(
          profiles?.map(async (profile) => {
            // Fetch role for this user
            const { data: roleData } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', profile.user_id)
              .single();

            const userRole = roleData?.role || 'user';

            return {
              id: profile.user_id,
              email: profile.display_name || `user-${profile.user_id.slice(0, 8)}`,
              displayName: profile.display_name || profile.first_name || profile.last_name || 'Anonymous User',
              role: userRole,
              status: profile.is_online ? 'active' : 'inactive',
              joinDate: new Date(profile.created_at).toLocaleDateString(),
              lastActive: profile.last_seen_at ? new Date(profile.last_seen_at).toLocaleDateString() : 'Never',
              profileCompletion: profile.profile_completion_percentage || 0,
              location: profile.location || 'Not specified',
              userMode: profile.user_mode || 'Not set'
            };
          }) || []
        );

        setUsers(userList);
      } catch (error) {
        console.error('Error fetching users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (loading) {
    return <Box sx={{ p: 3 }}>Loading users...</Box>;
  }

  // No fallback data - only show real users

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'moderator': return 'default';
      default: return 'secondary';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    return status === 'active' ? 'default' : 'secondary';
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>User Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage user accounts, roles, and permissions
          </Typography>
        </Box>
        <ExportExcelButton onExport={async () => {
          const columns: ExportColumnDef<any>[] = [
            { header: 'Display Name', accessor: r => r.display_name },
            { header: 'Email', accessor: r => r.email },
            { header: 'Location', accessor: r => r.location },
            { header: 'Profile Completion %', accessor: r => r.profile_completion_percentage },
            { header: 'Created At', accessor: r => formatDateTime(r.created_at) },
            { header: 'Last Seen', accessor: r => formatDateTime(r.last_seen_at) },
          ];
          const allData = await fetchAllRows('profiles', 'id, display_name, email, location, profile_completion_percentage, created_at, last_seen_at', { column: 'display_name', ascending: true });
          await exportToExcel(allData, columns, generateFilename('users'));
        }} />
      </Box>

      {/* Quick Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3, mb: 4 }}>
        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 500 }}>Total Users</CardTitle>
            <Users style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{users.length}</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 500 }}>Active Users</CardTitle>
            <Eye style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {users.filter(u => u.status === 'active').length}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 500 }}>Administrators</CardTitle>
            <Shield style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {users.filter(u => u.role === 'admin').length}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 500 }}>Moderators</CardTitle>
            <UserPlus style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {users.filter(u => u.role === 'moderator').length}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
          <CardDescription>
            Search and manage user accounts and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
            <Box sx={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted-foreground)' }} />
              <Input
                placeholder="Search users by email or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </Box>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger style={{ width: 180 }}>
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </Box>

          {/* Users Table */}
          <Box sx={{ borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Join Date</TableHead>
                  <TableHead>Last Active</TableHead>
                  {isAdmin && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Box>
                        <Box sx={{ fontWeight: 500 }}>{user.displayName}</Box>
                        <Typography variant="body2" color="text.secondary">{user.email}</Typography>
                        <Typography variant="caption" color="text.secondary">Mode: {user.userMode}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(user.status)}>
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{user.location}</Typography>
                    </TableCell>
                    <TableCell>{user.joinDate}</TableCell>
                    <TableCell>{user.lastActive}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" style={{ height: 32, width: 32, padding: 0 }}>
                              <MoreHorizontal style={{ height: 16, width: 16 }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>View Profile</DropdownMenuItem>
                            <DropdownMenuItem>Edit Roles</DropdownMenuItem>
                            <DropdownMenuItem>Send Message</DropdownMenuItem>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  sx={{ color: 'error.main', '&:focus': { color: 'error.main' } }}
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  Suspend User
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Suspend User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to suspend {user.displayName}?
                                    This will prevent them from accessing the platform.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction sx={{ bgcolor: 'error.main', color: 'error.contrastText', '&:hover': { bgcolor: 'error.dark' } }}>
                                    Suspend
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          {filteredUsers.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Users style={{ width: 48, height: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
              <Typography variant="body2" color="text.secondary">No users found matching your criteria.</Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
