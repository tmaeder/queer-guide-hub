import { toast } from 'sonner';

interface AdminActionOptions<T> {
  /** Verb in past tense, e.g. "Approved 12 venues". Shown in the toast. */
  label: string;
  /** The destructive/mutating operation. Runs immediately. */
  perform: () => Promise<T> | T;
  /** Optional inverse. If provided, toast shows "Undo" button for `undoWindowMs`. */
  undo?: (result: T) => Promise<void> | void;
  /** Milliseconds to keep the Undo affordance up. Defaults to 5000. */
  undoWindowMs?: number;
  /** Optional message shown on success when no undo is available. */
  successMessage?: string;
  /** Optional message shown on error. Defaults to error.message. */
  errorMessage?: string;
}

/**
 * Standard wrapper for destructive admin actions.
 *
 * Why: Every mutation in /admin should be undoable for at least 5s (D10).
 * How to apply: replace direct `supabase.from(...).update(...)` + ad-hoc
 * `toast.success(...)` calls in admin pages with this helper.
 */
export async function adminAction<T>(opts: AdminActionOptions<T>): Promise<T | null> {
  try {
    const result = await opts.perform();
    if (opts.undo) {
      const undoWindowMs = opts.undoWindowMs ?? 5000;
      toast(opts.label, {
        duration: undoWindowMs,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await opts.undo!(result);
              toast.success('Undone');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Undo failed');
            }
          },
        },
      });
    } else {
      toast.success(opts.successMessage ?? opts.label);
    }
    return result;
  } catch (err) {
    toast.error(opts.errorMessage ?? (err instanceof Error ? err.message : 'Action failed'));
    return null;
  }
}
