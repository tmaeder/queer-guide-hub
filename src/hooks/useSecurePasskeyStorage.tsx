import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PasskeyEnrollmentStatus {
  is_enrolled: boolean;
  enrolled_at?: string;
  device_name?: string;
}

export function useSecurePasskeyStorage() {
  const { user } = useAuth();
  const [enrollmentStatus, setEnrollmentStatus] = useState<PasskeyEnrollmentStatus>({
    is_enrolled: false
  });
  const [loading, setLoading] = useState(true);

  // Fetch passkey enrollment status from database
  const fetchEnrollmentStatus = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_passkey_enrollment')
        .select('is_enrolled, enrolled_at, device_name')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error is okay
        console.error('Error fetching passkey status:', error);
        setEnrollmentStatus({ is_enrolled: false });
      } else if (data) {
        setEnrollmentStatus({
          is_enrolled: data.is_enrolled,
          enrolled_at: data.enrolled_at,
          device_name: data.device_name
        });
      } else {
        setEnrollmentStatus({ is_enrolled: false });
      }
    } catch (error) {
      console.error('Unexpected error fetching passkey status:', error);
      setEnrollmentStatus({ is_enrolled: false });
    } finally {
      setLoading(false);
    }
  };

  // Update passkey enrollment status in database
  const updateEnrollmentStatus = async (status: Partial<PasskeyEnrollmentStatus>) => {
    if (!user) return false;

    try {
      const updateData = {
        user_id: user.id,
        is_enrolled: status.is_enrolled ?? false,
        enrolled_at: status.is_enrolled ? new Date().toISOString() : null,
        device_name: status.device_name || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('user_passkey_enrollment')
        .upsert(updateData, { onConflict: 'user_id' });

      if (error) {
        console.error('Error updating passkey status:', error);
        return false;
      }

      // Update local state
      setEnrollmentStatus(prev => ({ ...prev, ...status }));
      
      // Clear any legacy localStorage entries for security
      try {
        localStorage.removeItem('hasPasskey');
        localStorage.removeItem('passkey_enrolled');
      } catch (e) {
        // Ignore localStorage errors
      }

      return true;
    } catch (error) {
      console.error('Unexpected error updating passkey status:', error);
      return false;
    }
  };

  // Migrate from localStorage if needed
  const migrateLegacyStorage = async () => {
    if (!user) return;

    try {
      const legacyHasPasskey = localStorage.getItem('hasPasskey');
      const legacyEnrolled = localStorage.getItem('passkey_enrolled');
      
      if (legacyHasPasskey === 'true' || legacyEnrolled === 'true') {
        // Migrate to database
        await updateEnrollmentStatus({ 
          is_enrolled: true,
          device_name: 'Legacy Device'
        });
        
        // Clear legacy storage
        localStorage.removeItem('hasPasskey');
        localStorage.removeItem('passkey_enrolled');
      }
    } catch (error) {
      console.error('Error migrating legacy passkey storage:', error);
    }
  };

  useEffect(() => {
    if (user) {
      migrateLegacyStorage().then(() => {
        fetchEnrollmentStatus();
      });
    } else {
      setLoading(false);
      setEnrollmentStatus({ is_enrolled: false });
    }
  }, [user]);

  return {
    enrollmentStatus,
    loading,
    updateEnrollmentStatus,
    refetchStatus: fetchEnrollmentStatus
  };
}