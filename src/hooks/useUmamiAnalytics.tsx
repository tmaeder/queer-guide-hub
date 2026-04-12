import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UmamiEventData {
  name: string;
  data?: Record<string, unknown>;
  url?: string;
  title?: string;
}

// Browser detection utility
const getBrowserInfo = () => {
  const userAgent = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'desktop';

  // Browser detection
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  // OS detection
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  // Device detection
  if (/Mobi|Android/i.test(userAgent)) device = 'mobile';
  else if (/Tablet|iPad/i.test(userAgent)) device = 'tablet';

  return { browser, os, device };
};

export const useUmamiAnalytics = () => {
  const trackEvent = useCallback(async (eventData: UmamiEventData) => {
    try {
      const { browser, os, device } = getBrowserInfo();
      
      // Add timeout and better error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const { error } = await supabase.functions.invoke('umami-analytics', {
        body: {
          name: eventData.name,
          data: eventData.data,
          url: eventData.url || window.location.pathname + window.location.search,
          title: eventData.title || document.title,
          hostname: window.location.hostname,
          language: navigator.language,
          referrer: document.referrer,
          screen: `${window.screen.width}x${window.screen.height}`,
          browser,
          os,
          device,
        },
      });

      clearTimeout(timeoutId);

      if (error) {
        // Silently log error to prevent console spam
        console.debug('Analytics tracking failed:', error.message);
      }
    } catch (error) {
      // Silently handle analytics errors to not impact user experience
      console.debug('Analytics error:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, []);

  const trackPageView = useCallback(async (url?: string, title?: string) => {
    try {
      const { browser, os, device } = getBrowserInfo();
      
      // Add timeout and better error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const { error } = await supabase.functions.invoke('umami-analytics', {
        body: {
          url: url || window.location.pathname + window.location.search,
          title: title || document.title,
          hostname: window.location.hostname,
          language: navigator.language,
          referrer: document.referrer,
          screen: `${window.screen.width}x${window.screen.height}`,
          browser,
          os,
          device,
        },
      });

      clearTimeout(timeoutId);

      if (error) {
        // Silently log error to prevent console spam
        console.debug('Analytics tracking failed:', error.message);
      }
    } catch (error) {
      // Silently handle analytics errors to not impact user experience
      console.debug('Analytics error:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, []);

  return {
    trackEvent,
    trackPageView,
  };
};