import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
type AuditLog = Database['public']['Tables']['user_role_audit_log']['Row'];

export function useSecureRoleManagement() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const assignRole = async (userId: string, role: AppRole) => {
    try {
      setLoading(true);
      
      // Use the new secure function
      const { error } = await supabase.rpc('assign_user_role', {
        user_id: userId,
        role_name: role
      });

      if (error) throw error;

      // Log successful role assignment
      try {
        await supabase.rpc('log_enhanced_security_event', {
          p_event_type: 'ROLE_ASSIGNMENT_SUCCESS',
          p_user_id: null,
          p_metadata: {
            target_user_id: userId,
            assigned_role: role,
            timestamp: new Date().toISOString()
          },
          p_severity: 'info'
        });
      } catch (logError) {
        console.error('Failed to log security event:', logError);
      }

      toast({
        title: "Role Assigned",
        description: `Successfully assigned ${role} role to user.`,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error assigning role:', error);
      
      // Log failed role assignment attempt
      try {
        await supabase.rpc('log_enhanced_security_event', {
          p_event_type: 'ROLE_ASSIGNMENT_FAILED',
          p_user_id: null,
          p_metadata: {
            target_user_id: userId,
            attempted_role: role,
            error_message: error.message,
            timestamp: new Date().toISOString()
          },
          p_severity: 'high'
        });
      } catch (logError) {
        console.error('Failed to log security event:', logError);
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to assign role",
        variant: "destructive"
      });
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  const removeRole = async (userId: string, role: AppRole) => {
    try {
      setLoading(true);
      
      // Remove role by deleting from user_roles table
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);

      if (error) throw error;

      toast({
        title: "Role Removed",
        description: `Successfully removed ${role} role from user.`,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error removing role:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove role",
        variant: "destructive"
      });
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('user_role_audit_log')
        .select(`
          *,
          admin_profile:profiles!user_role_audit_log_admin_user_id_fkey(display_name),
          target_profile:profiles!user_role_audit_log_target_user_id_fkey(display_name)
        `)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      return { data, error: null };
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      return { data: null, error };
    }
  };

  return {
    assignRole,
    removeRole,
    fetchAuditLogs,
    loading
  };
}