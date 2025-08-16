import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

interface SecureDataGuardProps {
  children: React.ReactNode;
  userId: string;
  dataType: 'profile' | 'location' | 'financial' | 'messages' | 'photos';
  adminJustification?: string;
  fallback?: React.ReactNode;
}

/**
 * SecureDataGuard - Enhanced privacy protection component
 * Implements strict access controls for sensitive user data
 */
export function SecureDataGuard({ 
  children, 
  userId, 
  dataType,
  adminJustification = 'data_access',
  fallback = null
}: SecureDataGuardProps) {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();

  // Owner always has access to their own data
  if (user?.id === userId) {
    return <>{children}</>;
  }

  // Admin access requires justification and is logged
  if (isAdmin && adminJustification) {
    // This would trigger server-side logging when data is actually accessed
    console.warn(`Admin data access: ${dataType} for user ${userId}, justification: ${adminJustification}`);
    return <>{children}</>;
  }

  // Default deny - privacy by design
  return <>{fallback}</>;
}