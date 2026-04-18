/**
 * useSubmission — Form state, step navigation, validation, Supabase insert
 * for community submissions via the unified submission system.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { SubmissionTypeConfig } from '@/config/submissionRegistry';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { ensureProtocol } from '@/utils/ensureProtocol';

export function useSubmission(config: SubmissionTypeConfig) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [data, setData] = useState<Record<string, unknown>>({ ...config.defaults });
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const contentConfig = contentTypeRegistry[config.contentType];

  // ── Field setters ──────────────────────────────────────────────

  const setField = useCallback((name: string, value: unknown) => {
    setData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user changes a field
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  /** Batch-set multiple fields (used by LocationField for auto-populating city/country/etc.) */
  const setFields = useCallback((fields: Record<string, unknown>) => {
    setData((prev) => ({ ...prev, ...fields }));
  }, []);

  // ── Validation ─────────────────────────────────────────────────

  const validateStep = useCallback(
    (stepIndex: number): boolean => {
      const step = config.steps[stepIndex];
      if (!step) return true;

      const newErrors: Record<string, string> = {};

      for (const fieldName of step.fields) {
        const fieldConfig = contentConfig?.fields.find((f) => f.name === fieldName);
        if (!fieldConfig) continue;

        const value = data[fieldName];
        if (fieldConfig.required && (value === undefined || value === null || (typeof value === 'string' && !value.trim()))) {
          newErrors[fieldName] = `${fieldConfig.label} is required`;
        }

        if (fieldConfig.type === 'url' && typeof value === 'string' && value.trim()) {
          const normalized = ensureProtocol(value) as string;
          try {
            new URL(normalized);
            // Persist the protocol-prefixed value so downstream consumers
            // (anchors, admin review, RSS) see a real URL.
            if (normalized !== value) {
              setData((prev) => ({ ...prev, [fieldName]: normalized }));
            }
          } catch {
            newErrors[fieldName] = `Enter a valid website (e.g., example.com or https://example.com)`;
          }
        }
      }

      setErrors((prev) => {
        // Clear old errors for this step's fields, then add new ones
        const cleared = { ...prev };
        for (const fieldName of step.fields) {
          delete cleared[fieldName];
        }
        return { ...cleared, ...newErrors };
      });

      return Object.keys(newErrors).length === 0;
    },
    [config.steps, contentConfig, data],
  );

  // ── Step navigation ────────────────────────────────────────────

  const nextStep = useCallback(() => {
    if (validateStep(currentStep)) {
      setCurrentStep((s) => Math.min(s + 1, config.steps.length - 1));
    }
  }, [currentStep, validateStep, config.steps.length]);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const goToStep = useCallback(
    (step: number) => {
      if (step < currentStep) {
        setCurrentStep(step);
      } else if (step === currentStep + 1 && validateStep(currentStep)) {
        setCurrentStep(step);
      }
    },
    [currentStep, validateStep],
  );

  // ── Submit ─────────────────────────────────────────────────────

  const submit = useCallback(async () => {
    // Honeypot check — bots fill this
    if (honeypot) return;

    // Validate all steps
    for (let i = 0; i < config.steps.length; i++) {
      if (!validateStep(i)) {
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
      const { error } = await supabase.from('community_submissions' as 'venues').insert({
        content_type: config.id,
        data: data,
        submitted_by: user.id,
      });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: `${config.label} submitted!`,
        description: 'Thank you — your submission will be reviewed shortly.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Submission failed',
        description: err instanceof Error ? err.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [config, data, honeypot, user, toast, validateStep]);

  // ── Reset ──────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setData({ ...config.defaults });
    setCurrentStep(0);
    setErrors({});
    setIsSubmitted(false);
    setHoneypot('');
  }, [config.defaults]);

  return {
    data,
    errors,
    currentStep,
    isSubmitting,
    isSubmitted,
    totalSteps: config.steps.length,
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
