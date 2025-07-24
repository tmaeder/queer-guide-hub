import { useCallback, useEffect, useState } from 'react';

export function usePerformance() {
  const [metrics, setMetrics] = useState({
    fcp: 0,
    lcp: 0,
    cls: 0,
    fid: 0,
    ttfb: 0
  });

  useEffect(() => {
    // Measure First Contentful Paint (FCP)
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          setMetrics(prev => ({ ...prev, fcp: entry.startTime }));
        }
      }
    });
    observer.observe({ entryTypes: ['paint'] });

    // Measure Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      setMetrics(prev => ({ ...prev, lcp: lastEntry.startTime }));
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

    // Measure Cumulative Layout Shift (CLS)
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutEntry = entry as any; // LayoutShift interface not fully supported
        if (!layoutEntry.hadRecentInput) {
          clsValue += layoutEntry.value;
        }
      }
      setMetrics(prev => ({ ...prev, cls: clsValue }));
    });
    
    try {
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      // Layout shift not supported in all browsers
      console.warn('Layout shift measurement not supported');
    }

    // Measure Time to First Byte (TTFB)
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigation) {
      const ttfb = navigation.responseStart - navigation.requestStart;
      setMetrics(prev => ({ ...prev, ttfb }));
    }

    return () => {
      observer.disconnect();
      lcpObserver.disconnect();
      clsObserver.disconnect();
    };
  }, []);

  const measureCustomMetric = useCallback((name: string, startTime: number) => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Custom metric ${name}: ${duration.toFixed(2)}ms`);
    }

    // Send to analytics if configured
    if (window.gtag) {
      window.gtag('event', 'timing_complete', {
        name,
        value: Math.round(duration)
      });
    }

    return duration;
  }, []);

  const markStart = useCallback((name: string) => {
    performance.mark(`${name}-start`);
    return performance.now();
  }, []);

  const markEnd = useCallback((name: string, startTime?: number) => {
    performance.mark(`${name}-end`);
    
    if (startTime) {
      return measureCustomMetric(name, startTime);
    }

    try {
      performance.measure(name, `${name}-start`, `${name}-end`);
      const measure = performance.getEntriesByName(name, 'measure')[0];
      return measure.duration;
    } catch (error) {
      console.warn('Performance measurement failed:', error);
      return 0;
    }
  }, [measureCustomMetric]);

  return {
    metrics,
    markStart,
    markEnd,
    measureCustomMetric
  };
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}