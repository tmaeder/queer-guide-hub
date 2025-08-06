import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UmamiEventData {
  name: string;
  data?: Record<string, any>;
  url?: string;
  title?: string;
}

export const useUmamiAnalytics = () => {
  const trackEvent = useCallback(async (eventData: UmamiEventData) => {
    try {
      // Track via client-side umami if available
      if (typeof window !== 'undefined' && (window as any).umami) {
        (window as any).umami.track(eventData.name, eventData.data);
      }

      // Also track via our edge function for server-side analytics
      const { error } = await supabase.functions.invoke('umami-analytics', {
        body: {
          name: eventData.name,
          data: eventData.data,
          url: eventData.url || window.location.pathname,
          title: eventData.title || document.title,
          hostname: window.location.hostname,
          language: navigator.language,
          referrer: document.referrer,
          screen: `${window.screen.width}x${window.screen.height}`,
        },
      });

      if (error) {
        console.error('Error tracking event via edge function:', error);
      }
    } catch (error) {
      console.error('Error tracking umami event:', error);
    }
  }, []);

  const trackPageView = useCallback(async (url?: string, title?: string) => {
    try {
      // Track via client-side umami if available
      if (typeof window !== 'undefined' && (window as any).umami) {
        (window as any).umami.track();
      }

      // Also track via our edge function
      const { error } = await supabase.functions.invoke('umami-analytics', {
        body: {
          url: url || window.location.pathname,
          title: title || document.title,
          hostname: window.location.hostname,
          language: navigator.language,
          referrer: document.referrer,
          screen: `${window.screen.width}x${window.screen.height}`,
        },
      });

      if (error) {
        console.error('Error tracking page view via edge function:', error);
      }
    } catch (error) {
      console.error('Error tracking umami page view:', error);
    }
  }, []);

  return {
    trackEvent,
    trackPageView,
  };
};