import { useState, useEffect, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import { useLoadingState } from './useLoadingState';

interface SecurityMetrics {
  criticalAlerts: number;
  highAlerts: number;
  mediumAlerts: number;
  totalEvents: number;
  privacyUpdates: number;
  locationAnonymizations: number;
  adminDataAccess: number;
  suspiciousActivityScore: number;
}

interface SecurityAction {
  type: string;
  metadata?: Record<string, any>;
}

const DEFAULT_METRICS: SecurityMetrics = {
  criticalAlerts: 0,
  highAlerts: 0,
  mediumAlerts: 0,
  totalEvents: 0,
  privacyUpdates: 0,
  locationAnonymizations: 0,
  adminDataAccess: 0,
  suspiciousActivityScore: 0
};

export function useConsolidatedSecurity() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics>(DEFAULT_METRICS);
  const { loading, error, withLoading } = useLoadingState();

  const fetchSecurityMetrics = useCallback(async () => {
    if (!user) return null;

    return withLoading(async () => {
      const { data: events, error } = await supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const metrics = events?.reduce((acc, event) => {
        acc.totalEvents++;
        
        // Categorize by event type
        if (event.event_type.includes('CRITICAL') || event.event_type.includes('SECURITY_INCIDENT')) {
          acc.criticalAlerts++;
        } else if (event.event_type.includes('ADMIN') || event.event_type.includes('ACCESS') || event.event_type.includes('FINANCIAL')) {
          acc.highAlerts++;
        } else {
          acc.mediumAlerts++;
        }

        // Count specific event types
        if (event.event_type === 'PRIVACY_SETTINGS_UPDATED') {
          acc.privacyUpdates++;
        } else if (event.event_type === 'LOCATION_DATA_ANONYMIZED') {
          acc.locationAnonymizations++;
        } else if (event.event_type.includes('ADMIN') && event.event_type.includes('ACCESS')) {
          acc.adminDataAccess++;
        }

        return acc;
      }, { ...DEFAULT_METRICS }) || DEFAULT_METRICS;

      // Calculate suspicious activity score
      metrics.suspiciousActivityScore = Math.min(100, 
        (metrics.criticalAlerts * 10) + (metrics.highAlerts * 3) + metrics.mediumAlerts
      );

      setSecurityMetrics(metrics);
      return metrics;
    });
  }, [user, withLoading]);

  const logSecurityAction = useCallback(async (action: SecurityAction) => {
    if (!user) return;

    try {
      await api.rpc('log_security_event', {
        p_event_type: action.type,
        p_user_id: user.id,
        p_metadata: action.metadata || {},
        p_severity: 'medium'
      });

      // Refresh metrics after logging
      fetchSecurityMetrics();
    } catch (error) {
      console.error('Failed to log security action:', error);
    }
  }, [user, fetchSecurityMetrics]);

  const triggerSecurityIncident = useCallback(async (
    incidentType: string, 
    severity: 'critical' | 'high' | 'medium' = 'high',
    metadata?: Record<string, any>
  ) => {
    try {
      await api.rpc('log_security_event', {
        p_event_type: incidentType,
        p_severity: severity,
        p_metadata: metadata || {},
        p_user_id: user?.id
      });

      toast({
        title: "Security Incident Logged",
        description: `${incidentType} incident has been recorded and will be reviewed.`,
        variant: severity === 'critical' ? 'destructive' : 'default'
      });

      fetchSecurityMetrics();
    } catch (error) {
      console.error('Failed to trigger security incident:', error);
      toast({
        title: "Error",
        description: "Failed to log security incident.",
        variant: "destructive"
      });
    }
  }, [toast, fetchSecurityMetrics]);

  const anonymizeLocationData = useCallback(async () => {
    return withLoading(async () => {
      const { error } = await api.rpc('anonymize_location_data');
      if (error) throw error;

      await logSecurityAction({ 
        type: 'LOCATION_DATA_ANONYMIZED',
        metadata: { triggeredBy: 'manual', timestamp: new Date().toISOString() }
      });

      toast({
        title: "Success",
        description: "Location data anonymization completed.",
        variant: "default"
      });
    });
  }, [withLoading, logSecurityAction, toast]);

  useEffect(() => {
    if (user) {
      fetchSecurityMetrics();
    }
  }, [user, fetchSecurityMetrics]);

  return {
    securityMetrics,
    loading,
    error,
    logSecurityAction,
    triggerSecurityIncident,
    anonymizeLocationData,
    refreshMetrics: fetchSecurityMetrics
  };
}