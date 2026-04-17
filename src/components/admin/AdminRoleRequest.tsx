import Typography from '@mui/material/Typography';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

export function AdminRoleRequest() {
  const { user: _user } = useAuth();
  const { isAdmin, loading } = useAdminRoles();

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>Checking your permissions...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Shield style={{ width: 20, height: 20 }} />
          Admin Access Required
        </CardTitle>
        <CardDescription>
          You need admin privileges to use this feature.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info style={{ width: 16, height: 16 }} />
          <AlertDescription>
            Please contact an existing administrator to request access.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
