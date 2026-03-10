import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { api } from '@/integrations/api/client';

interface PrivacyGuardProps {
  children: React.ReactNode;
  profileUserId: string;
  requiredPrivacyField: 'sexual_orientation_public' | 'gender_identity_public' | 'pronouns_public' | 'bio_public' | 'location_public' | 'phone_public' | 'emergency_contact_public' | 'relationship_status_public' | 'income_range_public' | 'political_views_public' | 'religious_beliefs_public' | 'interests_public' | 'contact_public';
  privacySettings?: Record<string, any>;
  fallback?: React.ReactNode;
  adminJustification?: string;
  logAccess?: boolean;
}

export function PrivacyGuard({ 
  children, 
  profileUserId, 
  requiredPrivacyField, 
  privacySettings = {},
  fallback = null,
  adminJustification = 'data_access',
  logAccess = true
}: PrivacyGuardProps) {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();

  // Always show content to the profile owner
  if (user?.id === profileUserId) {
    return <>{children}</>;
  }

  // Admin access with enhanced logging and justification
  if (isAdmin && adminJustification) {
    // Log admin access for audit trail
    if (logAccess) {
      api.rpc('log_security_event', {
        p_event_type: 'ADMIN_PRIVACY_OVERRIDE',
        p_user_id: user?.id || null,
        p_metadata: {
          accessed_user: profileUserId,
          privacy_field: requiredPrivacyField,
          justification: adminJustification,
          timestamp: new Date().toISOString()
        },
        p_severity: 'high'
      });
    }
    return <>{children}</>;
  }

  // Enhanced privacy check with secure defaults
  // Default to private (false) if setting not found
  const isPublic = privacySettings && 
    typeof privacySettings === 'object' &&
    privacySettings[requiredPrivacyField] === true;

  if (isPublic) {
    return <>{children}</>;
  }

  // Return fallback or null if content should be private
  return <>{fallback}</>;
}