import { useState } from 'react';
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
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 bg-primary mx-auto mb-4"></div>
          <p>Checking your permissions...</p>
        </CardContent>
      </Card>
    );
  }

  if (isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Crown className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Admin Access Granted</h2>
          <p className="text-muted-foreground mb-4">You have admin privileges.</p>
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
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Access Required
        </CardTitle>
        <CardDescription>
          You need admin privileges to use this feature.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Current Status:</strong> You are logged in as a regular user.
            <br />
            <strong>User ID:</strong> {user?.id}
            <br />
            <strong>Email:</strong> {user?.email}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If this is your project and you should have admin access, you can assign yourself admin privileges:
          </p>
          
          <Button 
            onClick={handleRequestAdmin}
            disabled={requesting}
            className="w-full"
          >
            <User className="h-4 w-4 mr-2" />
            {requesting ? "Assigning Role..." : "Grant Myself Admin Access"}
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Note: This will only work if the database policies allow role assignment.
            If this fails, you may need to ask an existing admin to grant you access.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}