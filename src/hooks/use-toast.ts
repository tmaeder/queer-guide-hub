import * as React from 'react';
import { toast as sonnerToast, type ExternalToast } from 'sonner';
import { hapticTrigger } from '@/hooks/useHaptics';

/**
 * Compatibility shim: the app historically had TWO toast systems mounted at
 * once — this shadcn/radix `useToast` and Sonner. They drew the same surface
 * two different ways. This hook now delegates to Sonner so there is exactly
 * ONE renderer, while keeping the `toast({ title, description, variant })`
 * API that ~270 call sites already use. No call-site migration required.
 *
 * `variant: 'destructive'` → `sonnerToast.error` (Sonner injects the error
 * icon; we stay strictly B&W per the design system — no richColors hue).
 */

type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  action?: ExternalToast['action'];
  duration?: number;
  id?: string | number;
  [key: string]: unknown;
};

export type ToastReturn = {
  id: string;
  dismiss: () => void;
  update: (props: ToastInput) => void;
};

function toast(props: ToastInput = {}): ToastReturn {
  const { title, description, variant, action, duration } = props;

  if (variant === 'destructive') hapticTrigger('error');
  else hapticTrigger('nudge');

  const hasTitle = title != null && title !== '';
  const message = (hasTitle ? title : description) ?? '';

  const options: ExternalToast = {};
  if (duration != null) options.duration = duration;
  if (action != null) options.action = action;
  // Only attach description when we also have a distinct title, so a
  // description-only toast isn't rendered twice.
  if (hasTitle && description != null) options.description = description;

  const id =
    variant === 'destructive'
      ? sonnerToast.error(message, options)
      : sonnerToast(message, options);

  return {
    id: String(id),
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: ToastInput) =>
      sonnerToast(next.title ?? message, {
        ...options,
        id,
        description:
          next.title != null && next.description != null
            ? next.description
            : options.description,
      }),
  };
}

function useToast() {
  // `toasts` is retained (always empty) for any legacy consumer that still
  // destructures it; Sonner owns the actual render queue now.
  return {
    toasts: [] as never[],
    toast,
    dismiss: (toastId?: string) => sonnerToast.dismiss(toastId),
  };
}

export { useToast, toast };
