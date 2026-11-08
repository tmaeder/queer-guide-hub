/**
 * useSubmission — Zod-validated wizard state for community submissions.
 *
 * Errors change only when a step is validated (nextStep / goToStep / submit),
 * not on every keystroke, matching the prior React Hook Form `onSubmit` mode.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { SubmissionTypeConfig } from '@/config/submissionRegistry';
import { ensureProtocol } from '@/utils/ensureProtocol';
import { buildSubmissionSchema } from '@/hooks/submission/buildSubmissionSchema';
import { zodFieldErrors } from '@/lib/zodFieldErrors';

type Values = Record<string, unknown>;

export interface NextStepResult {
  ok: boolean;
  firstInvalid?: string;
}

export function useSubmission(config: SubmissionTypeConfig) {
  const { user } = useAuth();
  const { toast } = useToast();

  const { fullSchema } = useMemo(() => buildSubmissionSchema(config), [config]);

  const [data, setData] = useState<Values>(() => ({ ...(config.defaults as Values) }));
  // Mirrors `data` synchronously so validation right after setField sees the new value.
  const valuesRef = useRef<Values>(data);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [stepAnnouncement, setStepAnnouncement] = useState('');

  const setFields = useCallback((fields: Values) => {
    valuesRef.current = { ...valuesRef.current, ...fields };
    setData(valuesRef.current);
  }, []);

  const setField = useCallback(
    (name: string, value: unknown) => setFields({ [name]: value }),
    [setFields],
  );

  const validateStep = useCallback(
    async (stepIndex: number): Promise<NextStepResult> => {
      const step = config.steps[stepIndex];
      if (!step) return { ok: true };

      // Normalize string-looking URL fields before validating (so `foo.com` parses).
      const normalized: Values = {};
      for (const fieldName of step.fields) {
        const current = valuesRef.current[fieldName];
        if (
          typeof current === 'string' &&
          current.trim() &&
          !/^https?:\/\//i.test(current) &&
          /^[a-z0-9.-]+\.[a-z]{2,}/i.test(current)
        ) {
          const next = ensureProtocol(current) as string;
          try {
            new URL(next);
            if (next !== current) normalized[fieldName] = next;
          } catch {
            /* Zod will flag */
          }
        }
      }
      if (Object.keys(normalized).length) setFields(normalized);

      const all = zodFieldErrors(fullSchema, valuesRef.current);
      setErrors((prev) => {
        const out = { ...prev };
        for (const name of step.fields) {
          if (all[name]) out[name] = all[name];
          else delete out[name];
        }
        return out;
      });
      const firstInvalid = step.fields.find((name) => all[name]);
      if (!firstInvalid) {
        setStepAnnouncement('');
        return { ok: true };
      }
      setStepAnnouncement('Please fix the highlighted fields before continuing.');
      return { ok: false, firstInvalid };
    },
    [config.steps, fullSchema, setFields],
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

    setIsSubmitting(true);
    try {
      const values = valuesRef.current;
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
        setErrors((prev) => ({
          ...prev,
          [fieldName]: 'Please enter a full valid URL like https://example.com',
        }));
      }
      toast({
        title: 'Submission failed',
        description: match ? 'Please fix form errors and try again.' : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [config, honeypot, user, toast, validateStep]);

  const reset = useCallback(() => {
    valuesRef.current = { ...(config.defaults as Values) };
    setData(valuesRef.current);
    setErrors({});
    setCurrentStep(0);
    setIsSubmitted(false);
    setHoneypot('');
    setStepAnnouncement('');
  }, [config.defaults]);

  return {
    data,
    errors,
    currentStep,
    isSubmitting,
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
  };
}
