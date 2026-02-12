import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, User, Crown, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function AdminRoleRequest() {
  const { user } = useAuth();
  const { isAdmin, loading, refetch } = useAdminRoles();
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);

  const handleRequestAdmin = async () => {
    if (!user) return;

    setRequesting(true);
    try {
      // Insert admin role for current user
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'admin'
        });

      if (error) {
        console.error('Error assigning admin role:', error);
        toast({
          title: "Role Assignment Failed",
          description: "Could not assign admin role. You may need to ask an existing admin.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Admin Role Assigned",
          description: "You now have admin privileges. Please refresh the page.",
          variant: "default"
        });
        // Refetch roles
        await refetch();
        // Refresh the page to apply changes
        window.location.reload();
      }
    } catch (error) {
      console.error('Error requesting admin:', error);
      toast({
        title: "Error",
        description: "An error occurred while requesting admin access.",
        variant: "destructive"
      });
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Box sx={{ width: 32, height: 32, bgcolor: 'primary.main', mx: 'auto', mb: 2, animation: 'spin 1s linear infinite', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />
          <Typography>Checking your permissions...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (isAdmin) {
    return (
      <Card>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Crown style={{ width: 48, height: 48, color: '#eab308', margin: '0 auto 16px' }} />
          <Typography variant="h5" sx={{ mb: 1 }}>Admin Access Granted</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>You have admin privileges.</Typography>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Shield style={{ width: 20, height: 20 }} />
          Admin Access Required
        </CardTitle>
        <CardDescription>
          You need admin privileges to use this feature.
        </CardDescription>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert>
          <Info style={{ width: 16, height: 16 }} />
          <AlertDescription>
            <strong>Current Status:</strong> You are logged in as a regular user.
            <br />
            <strong>User ID:</strong> {user?.id}
            <br />
            <strong>Email:</strong> {user?.email}
          </AlertDescription>
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            If this is your project and you should have admin access, you can assign yourself admin privileges:
          </Typography>

          <Button
            onClick={handleRequestAdmin}
            disabled={requesting}
            sx={{ width: '100%' }}
          >
            <User style={{ width: 16, height: 16, marginRight: 8 }} />
            {requesting ? "Assigning Role..." : "Grant Myself Admin Access"}
          </Button>

          <Typography variant="caption" color="text.secondary">
            Note: This will only work if the database policies allow role assignment.
            If this fails, you may need to ask an existing admin to grant you access.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
