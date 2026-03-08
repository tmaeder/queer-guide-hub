import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useUmamiAnalytics } from '@/hooks/useUmamiAnalytics';

export const AnalyticsTracker = () => {
  const location = useLocation();
  const { trackPageView } = useUmamiAnalytics();

  useEffect(() => {
    // Track page views on route change
    trackPageView(location.pathname + location.search, document.title);
  }, [location, trackPageView]);

  return null; // This component doesn't render anything
};
