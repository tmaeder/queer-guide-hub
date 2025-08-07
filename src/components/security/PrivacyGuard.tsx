import React from 'react';
import { useAuth } from '@/hooks/useAuth';

interface PrivacyGuardProps {
  children: React.ReactNode;
  profileUserId: string;
  requiredPrivacyField: 'sexual_orientation_public' | 'gender_identity_public' | 'pronouns_public' | 'bio_public' | 'location_public';
  privacySettings?: Record<string, any>;
  fallback?: React.ReactNode;
  isAdminOverride?: boolean;
}

export function PrivacyGuard({ 
  children, 
  profileUserId, 
  requiredPrivacyField, 
  privacySettings = {},
  fallback = null,
  isAdminOverride = false
}: PrivacyGuardProps) {
  const { user } = useAuth();

  // Always show content to the profile owner
  if (user?.id === profileUserId) {
    return <>{children}</>;
  }

  // Show content if admin override is enabled (for admin users)
  if (isAdminOverride) {
    return <>{children}</>;
  }

  // Check if the required privacy field is set to public
  const isPublic = privacySettings[requiredPrivacyField] === true || 
                   privacySettings[requiredPrivacyField] === 'true';

  if (isPublic) {
    return <>{children}</>;
  }

  // Return fallback or null if content should be private
  return <>{fallback}</>;
}