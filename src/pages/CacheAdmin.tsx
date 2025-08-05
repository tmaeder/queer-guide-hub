import React from 'react';
import { CacheManager } from '@/components/cache/CacheManager';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield } from 'lucide-react';

export default function CacheAdmin() {
  const { user } = useAuth();
  const { isAdmin, isModerator } = useAdminRoles();

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You must be logged in to access the cache administration panel.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isAdmin && !isModerator) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access the cache administration panel.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CacheManager />
    </div>
  );
}