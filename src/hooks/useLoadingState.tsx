import { useState, useCallback } from 'react';

interface UseLoadingStateOptions {
  initialLoading?: boolean;
}

interface LoadingState {
  loading: boolean;
  error: string | null;
}

export function useLoadingState(options: UseLoadingStateOptions = {}) {
  const [state, setState] = useState<LoadingState>({
    loading: options.initialLoading ?? false,
    error: null
  });

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading, error: loading ? null : prev.error }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error, loading: false }));
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, error: null });
  }, []);

  const withLoading = useCallback(async <T,>(
    asyncFn: () => Promise<T>
  ): Promise<T | null> => {
    setLoading(true);
    try {
      const result = await asyncFn();
      setLoading(false);
      return result;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      return null;
    }
  }, [setLoading, setError]);

  return {
    ...state,
    setLoading,
    setError,
    reset,
    withLoading
  };
}