/**
 * useAsyncAction — one hook for imperative, button-triggered async work
 * (`supabase.functions.invoke`, RPC calls, one-click admin actions).
 *
 * Replaces the copy-pasted `useState(loading)` + try/catch/finally blocks
 * scattered across admin manager components. By wrapping `useMutation` it
 * inherits the centralized mutation policy from `createOptimizedQueryClient`
 * (retry + Sentry capture), is safe across unmount (React Query owns the
 * lifecycle), and standardizes error toasting through sonner.
 *
 *
 */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

type MaybeFn<T, TArgs, TResult> = T | ((value: TResult, args: TArgs) => T);

export interface UseAsyncActionOptions<TArgs, TResult> {
  /** Toast text on success. Omit for no success toast. */
  successMessage?: MaybeFn<string, TArgs, TResult>;
  /** Override the error toast text. Defaults to the thrown error's message. */
  errorMessage?: string | ((error: Error, args: TArgs) => string);
  /** Auto-toast on error. Default true. */
  toastOnError?: boolean;
  onSuccess?: (result: TResult, args: TArgs) => void;
  onError?: (error: Error, args: TArgs) => void;
}

export function useAsyncAction<TArgs = void, TResult = unknown>(
  action: (args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions<TArgs, TResult> = {},
) {
  const mutation = useMutation<TResult, Error, TArgs>({
    mutationFn: action,
    onSuccess: (result, args) => {
      if (options.successMessage !== undefined) {
        const msg =
          typeof options.successMessage === 'function'
            ? options.successMessage(result, args)
            : options.successMessage;
        if (msg) toast.success(msg);
      }
      options.onSuccess?.(result, args);
    },
    onError: (error, args) => {
      if (options.toastOnError !== false) {
        const msg =
          typeof options.errorMessage === 'function'
            ? options.errorMessage(error, args)
            : options.errorMessage ?? error.message ?? 'Something went wrong';
        toast.error(msg);
      }
      options.onError?.(error, args);
    },
  });

  return {
    /** Fire-and-forget; errors are caught and toasted. */
    run: mutation.mutate,
    /** Awaitable variant; rejects on error (still toasts). */
    runAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
