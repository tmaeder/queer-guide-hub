import { useCallback, useMemo, useRef } from 'react';

// Memoized callback factory
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return useCallback(callback, deps);
}

// Stable reference hook
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  return useCallback((...args: Parameters<T>) => {
    return callbackRef.current(...args);
  }, []) as T;
}

// Optimized memoization for complex objects
export function useDeepMemo<T>(factory: () => T, deps: React.DependencyList): T {
  const depsRef = useRef<React.DependencyList>();
  const valueRef = useRef<T>();
  
  const hasChanged = !depsRef.current || 
    deps.length !== depsRef.current.length ||
    deps.some((dep, index) => !Object.is(dep, depsRef.current![index]));
  
  if (hasChanged) {
    depsRef.current = deps;
    valueRef.current = factory();
  }
  
  return valueRef.current!;
}

// Performance monitoring hook
export function usePerformanceMonitor(componentName: string) {
  const renderStartTime = useRef<number>();
  const renderCount = useRef(0);
  
  // Mark render start
  renderStartTime.current = performance.now();
  renderCount.current++;
  
  // Log render time in development
  if (process.env.NODE_ENV === 'development') {
    setTimeout(() => {
      const renderTime = performance.now() - renderStartTime.current!;
      if (renderTime > 16) { // More than one frame
        console.warn(`${componentName} slow render: ${renderTime.toFixed(2)}ms (render #${renderCount.current})`);
      }
    }, 0);
  }
  
  return useMemo(() => ({
    renderCount: renderCount.current,
    markRenderEnd: () => {
      const renderTime = performance.now() - renderStartTime.current!;
      return renderTime;
    }
  }), []);
}