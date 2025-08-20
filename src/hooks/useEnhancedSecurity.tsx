import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface SecurityMetrics {
  critical_alerts_24h: number;
  high_alerts_24h: number;
  failed_auth_attempts: number;
  suspicious_activity_score: number;
  last_security_scan: string | null;
}

interface SecurityAction {
  type: 'location_anonymize' | 'financial_access' | 'passkey_operation' | 'profile_access';
  metadata?: Record<string, any>;
}

export function useEnhancedSecurity() {
  const { user } = useAuth();
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSecurityMetrics();
    }
  }, [user]);

  const fetchSecurityMetrics = async () => {
    try {
      setLoading(true);
      
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // Fetch critical alerts in last 24h
      const { data: criticalAlerts } = await supabase
        .from('security_monitoring')
        .select('id')
        .eq('severity', 'critical')
        .gte('created_at', twentyFourHoursAgo);

      // Fetch high alerts in last 24h
      const { data: highAlerts } = await supabase
        .from('security_monitoring')
        .select('id')
        .eq('severity', 'high')
        .gte('created_at', twentyFourHoursAgo);

      // Calculate suspicious activity score based on recent events
      const { data: recentEvents } = await supabase
        .from('security_monitoring')
        .select('event_type, severity')
        .gte('created_at', twentyFourHoursAgo)
        .eq('user_id', user?.id);

      let suspiciousScore = 0;
      recentEvents?.forEach(event => {
        if (event.severity === 'critical') suspiciousScore += 10;
        else if (event.severity === 'high') suspiciousScore += 5;
        else if (event.severity === 'medium') suspiciousScore += 2;
      });

      setSecurityMetrics({
        critical_alerts_24h: criticalAlerts?.length || 0,
        high_alerts_24h: highAlerts?.length || 0,
        failed_auth_attempts: 0, // Would be calculated from auth logs
        suspicious_activity_score: suspiciousScore,
        last_security_scan: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error fetching security metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const logSecurityAction = async (action: SecurityAction) => {
    if (!user) return;

    try {
      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: `USER_${action.type.toUpperCase()}`,
        p_user_id: user.id,
        p_metadata: {
          action_type: action.type,
          timestamp: new Date().toISOString(),
          ...action.metadata
        },
        p_severity: 'medium'
      });
    } catch (err) {
      console.error('Error logging security action:', err);
    }
  };

  const triggerSecurityIncident = async (
    incidentType: string,
    severity: 'critical' | 'high' | 'medium' = 'high',
    metadata: Record<string, any> = {}
  ) => {
    try {
      const { data, error } = await supabase.rpc('trigger_security_incident', {
        p_incident_type: incidentType,
        p_severity: severity,
        p_metadata: {
          user_id: user?.id,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      });

      if (error) throw error;

      toast({
        title: "Security Incident Reported",
        description: `Incident ${incidentType} has been logged and is being investigated.`,
        variant: severity === 'critical' ? 'destructive' : 'default'
      });

      return data;
    } catch (err) {
      console.error('Error triggering security incident:', err);
      toast({
        title: "Failed to Report Incident",
        description: "There was an error reporting the security incident.",
        variant: "destructive"
      });
    }
  };

  const requestSecureAccess = async (
    accessType: 'financial' | 'location' | 'profile',
    targetUserId: string,
    justification: string
  ) => {
    if (!user) return false;

    try {
      let accessFunction = '';
      let params = {};

      switch (accessType) {
        case 'financial':
          accessFunction = 'check_financial_data_access';
          params = {
            p_user_id: targetUserId,
            p_admin_user_id: user.id,
            p_justification: justification
          };
          break;
        case 'location':
        case 'profile':
          accessFunction = 'audit_admin_sensitive_access';
          params = {
            p_admin_id: user.id,
            p_target_user_id: targetUserId,
            p_data_type: accessType,
            p_justification: justification
          };
          break;
        default:
          throw new Error('Invalid access type');
      }

      const { data, error } = await supabase.rpc(accessFunction, params);
      
      if (error) throw error;
      
      return data === true;
    } catch (err) {
      console.error('Error requesting secure access:', err);
      return false;
    }
  };

  const anonymizeLocationData = async () => {
    try {
      await supabase.rpc('anonymize_old_location_data');
      
      await logSecurityAction({
        type: 'location_anonymize',
        metadata: { manual_trigger: true }
      });

      toast({
        title: "Location Data Anonymized",
        description: "Old location data has been anonymized for privacy protection.",
      });

      return true;
    } catch (err) {
      console.error('Error anonymizing location data:', err);
      toast({
        title: "Anonymization Failed",
        description: "Failed to anonymize location data. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  };

  return {
    securityMetrics,
    loading,
    logSecurityAction,
    triggerSecurityIncident,
    requestSecureAccess,
    anonymizeLocationData,
    refreshMetrics: fetchSecurityMetrics
  };
}