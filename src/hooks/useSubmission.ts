/**
 * useSubmission — React Hook Form + Zod backed wizard state for community submissions.
 *
 * Public surface is kept shape-compatible with the prior imperative hook so
 * SubmitForm and other callers keep working. The underlying form state /
 * validation is now driven by RHF, with Zod schemas derived from the field
 * registry (buildSubmissionSchema).
 */

import { useCallback, useMemo, useState } from 'react';
import { useForm, type FieldValues, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { SubmissionTypeConfig } from '@/config/submissionRegistry';
import { ensureProtocol } from '@/utils/ensureProtocol';
import { buildSubmissionSchema } from '@/hooks/submission/buildSubmissionSchema';

export interface NextStepResult {
  ok: boolean;
  firstInvalid?: string;
}

export function useSubmission(config: SubmissionTypeConfig) {
  const { user } = useAuth();
  const { toast } = useToast();

  const { fullSchema } = useMemo(() => buildSubmissionSchema(config), [config]);

  const form = useForm<FieldValues>({
    resolver: zodResolver(fullSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: config.defaults as FieldValues,
    shouldFocusError: true,
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [stepAnnouncement, setStepAnnouncement] = useState('');

  const data = form.watch();
  const errors = form.formState.errors;

  const flatErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [name, err] of Object.entries(errors)) {
      const message = (err as { message?: string } | undefined)?.message;
      if (message) out[name] = message;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Object.keys(errors))]);

  const setField = useCallback(
    (name: string, value: unknown) => {
      form.setValue(name as Path<FieldValues>, value as FieldValues[string], {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: form.formState.isSubmitted,
      });
    },
    [form],
  );

  const setFields = useCallback(
    (fields: Record<string, unknown>) => {
      for (const [name, value] of Object.entries(fields)) {
        form.setValue(name as Path<FieldValues>, value as FieldValues[string], {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: form.formState.isSubmitted,
        });
      }
    },
    [form],
  );

  const validateStep = useCallback(
    async (stepIndex: number): Promise<NextStepResult> => {
      const step = config.steps[stepIndex];
      if (!step) return { ok: true };

      // Normalize string-looking URL fields before validating (so `foo.com` parses).
      for (const fieldName of step.fields) {
        const current = form.getValues(fieldName as Path<FieldValues>);
        if (typeof current === 'string' && current.trim() && !/^https?:\/\//i.test(current) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(current)) {
          const normalized = ensureProtocol(current) as string;
          try {
            new URL(normalized);
            if (normalized !== current) {
              form.setValue(fieldName as Path<FieldValues>, normalized as FieldValues[string], {
                shouldValidate: false,
              });
            }
          } catch {
            /* Zod will flag */
          }
        }
      }

      const ok = await form.trigger(step.fields as Path<FieldValues>[]);
      if (ok) {
        setStepAnnouncement('');
        return { ok: true };
      }
      const firstInvalid = step.fields.find((name) => form.formState.errors[name]);
      setStepAnnouncement('Please fix the highlighted fields before continuing.');
      return { ok: false, firstInvalid };
    },
    [config.steps, form],
  );

  const nextStep = useCallback(async (): Promise<NextStepResult> => {
    const result = await validateStep(currentStep);
    if (result.ok) {
      setCurrentStep((s) => Math.min(s + 1, config.steps.length - 1));
    }
    return result;
  }, [currentStep, validateStep, config.steps.length]);

  const prevStep = useCallback(() => {
    setStepAnnouncement('');
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const goToStep = useCallback(
    async (step: number) => {
      if (step < currentStep) {
        setCurrentStep(step);
        setStepAnnouncement('');
        return;
      }
      if (step === currentStep + 1) {
        const result = await validateStep(currentStep);
        if (result.ok) setCurrentStep(step);
      }
    },
    [currentStep, validateStep],
  );

  const submit = useCallback(async (): Promise<void> => {
    if (honeypot) return;

    for (let i = 0; i < config.steps.length; i++) {
      const result = await validateStep(i);
      if (!result.ok) {
        setCurrentStep(i);
        toast({ title: 'Please fix form errors', variant: 'destructive' });
        return;
      }
    }

    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Create a free account to submit content.',
        variant: 'default',
      });
      return;
    }

    try {
      const values = form.getValues();
      const { error } = await supabase.from('community_submissions' as 'venues').insert({
        content_type: config.id,
        data: values,
        submitted_by: user.id,
      });
      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: `${config.label} submitted!`,
        description: 'Thank you — your submission will be reviewed shortly.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Please try again later.';
      const match = message.match(/invalid_url:([a-z_]+)/i);
      if (match) {
        const fieldName = match[1];
        form.setError(fieldName as Path<FieldValues>, {
          type: 'server',
          message: 'Please enter a full valid URL like https://example.com',
        });
      }
      toast({
        title: 'Submission failed',
        description: match ? 'Please fix form errors and try again.' : message,
        variant: 'destructive',
      });
    }
  }, [config, honeypot, user, toast, validateStep, form]);

  const reset = useCallback(() => {
    form.reset(config.defaults as FieldValues);
    setCurrentStep(0);
    setIsSubmitted(false);
    setHoneypot('');
    setStepAnnouncement('');
  }, [form, config.defaults]);

  return {
    data,
    errors: flatErrors,
    currentStep,
    isSubmitting: form.formState.isSubmitting,
    isSubmitted,
    totalSteps: config.steps.length,
    stepAnnouncement,
    setField,
    setFields,
    nextStep,
    prevStep,
    goToStep,
    submit,
    reset,
    honeypot,
    setHoneypot,
    control: form.control,
  };
}
