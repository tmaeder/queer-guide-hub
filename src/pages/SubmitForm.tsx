/**
 * SubmitForm — /submit/:contentType
 * Generic multi-step submission form that reuses CMS FieldRenderer.
 */

import { useParams, useLocation } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Controller } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submissionRegistry } from '@/config/submissionRegistry';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { useSubmission } from '@/hooks/useSubmission';
import { useAuth } from '@/hooks/useAuth';
import { useFlyerScan } from '@/hooks/useFlyerScan';
import { supabase } from '@/integrations/supabase/client';
import { fetchCountryNameById } from '@/hooks/usePageFetchers';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { FlyerScanUpload } from '@/components/submission/FlyerScanUpload';
import { FlyerScanResults } from '@/components/submission/FlyerScanResults';
import { ArrowLeft, ArrowRight, CheckCircle, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SubmitForm = () => {
  const { _t } = useTranslation();
  const { contentType } = useParams<{ contentType: string }>();
  const navigate = useLocalizedNavigate();

  const config = contentType ? submissionRegistry[contentType] : undefined;

  // Unknown type fallback
  if (!config) {
    return (
      <div className="mx-auto py-12 px-4 text-center">
        <h5 className="text-xl font-semibold mb-2">Unknown submission type</h5>
        <p className="text-muted-foreground mb-4">
          The submission type "{contentType}" is not supported.
        </p>
        <Button onClick={() => navigate('/submit')}>Back to Hub</Button>
      </div>
    );
  }

  return <SubmitFormInner config={config} />;
};

// ── Inner form component (only renders when config is valid) ──────

interface SubmitFormInnerProps {
  config: NonNullable<(typeof submissionRegistry)[string]>;
}

function SubmitFormInner({ config }: SubmitFormInnerProps) {
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const contentConfig = contentTypeRegistry[config.contentType];

  const {
    data,
    errors,
    currentStep,
    isSubmitting,
    isSubmitted,
    totalSteps,
    stepAnnouncement,
    setFields,
    nextStep,
    prevStep,
    goToStep,
    submit,
    reset,
    honeypot,
    setHoneypot,
    control,
  } = useSubmission(config);

  // Flyer scan (only for event/venue)
  const supportsScan = config.id === 'event' || config.id === 'venue';
  const flyerScan = useFlyerScan();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const handleStartScan = (files: File[]) => {
    setSelectedVenueId(null);
    flyerScan.startScan(files);
  };
  const handleResetScan = () => {
    setSelectedVenueId(null);
    flyerScan.reset();
  };

  const handleApplyScan = (resultIdx: number, itemIdx: number, detectedType: 'event' | 'venue') => {
    const formData = flyerScan.applyToForm(resultIdx, itemIdx, selectedVenueId ?? undefined);
    setFields(formData);

    // If detected type differs from current form, navigate to correct form
    if (detectedType !== config.id) {
      const imageUrl = flyerScan.results[resultIdx]?.image_url;
      navigate(`/submit/${detectedType}`, {
        state: { prefill: formData, imageUrl },
      });
      return;
    }
  };

  // Apply prefill data from navigation state (e.g., type-switch from scan results)
  useEffect(() => {
    const state = location.state as { prefill?: Record<string, unknown> } | null;
    if (state?.prefill) {
      setFields(state.prefill);
      // Clear the state so it doesn't re-apply on re-renders
      window.history.replaceState({}, '');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect city from title — when title contains a known city name, pre-fill city field
  const titleField = config.titleField; // 'title' for events, 'name' for venues
  const titleValue = String(data[titleField] ?? '');
  const cityDetectRef = useRef('');
  useEffect(() => {
    if (!titleValue || titleValue.length < 3) return;
    if (data.city && data.city_id) return; // don't override when fully resolved
    if (cityDetectRef.current === titleValue) return; // already checked this value

    const timer = setTimeout(async () => {
      cityDetectRef.current = titleValue;
      const { data: rows } = await supabase.rpc('extract_city_from_text', {
        input_text: titleValue,
      });
      const match = Array.isArray(rows) ? rows[0] : rows;
      if (!match?.id || data.city) return; // re-check city in case user filled it during delay

      // Resolve country name for the country field (DUP-4)
      let countryName = '';
      if (match.country_id) {
        countryName = (await fetchCountryNameById(match.country_id)) ?? '';
      }

      setFields({
        city: match.name,
        city_id: match.id,
        ...(match.country_id ? { country_id: match.country_id } : {}),
        ...(countryName ? { country: countryName } : {}),
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [titleValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStepConfig = config.steps[currentStep];
  const isLastStep = currentStep === totalSteps - 1;

  // Resolve FieldConfig objects for the current step's fields
  const stepFields = useMemo(() => {
    if (!currentStepConfig || !contentConfig) return [];
    return currentStepConfig.fields
      .map((fieldName) => contentConfig.fields.find((f) => f.name === fieldName))
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
      .map((f) => ({
        ...f,
        // Override CMS-specific flags — submission fields are always editable & visible
        readOnly: false,
        hidden: false,
      }));
  }, [currentStepConfig, contentConfig]);

  // ── Success screen ─────────────────────────────────────────────

  if (isSubmitted) {
    return (
      <div className="mx-auto py-12 px-4">
        <Card>
          <CardContent>
            <CheckCircle
              style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'hsl(var(--brand))' }}
            />
            <h5 className="text-xl font-semibold mb-2">Thank you!</h5>
            <p className="text-muted-foreground mb-6">
              Your {config.label.toLowerCase()} has been submitted and will be reviewed by our team.
              It will appear on the site once approved.
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => navigate('/submit')}>Submit More</Button>
              <Button variant="outline" onClick={reset}>
                Submit Another {config.label}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className="mx-auto py-8 px-4">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/submit')}
        className="mb-4 flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        All Submissions
      </Button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Icon style={{ width: 28, height: 28, color: config.color }} />
        <h4 className="text-3xl font-bold">Submit {config.label}</h4>
      </div>
      <p className="text-muted-foreground mb-6">{config.description}</p>

      {/* Auth gate */}
      {!user && (
        <Card id="submit-auth-hint" role="status">
          <CardContent>
            <p className="text-sm mb-2">
              <strong>Sign in required.</strong> You can fill out the form now, but you'll need an
              account to submit.
            </p>
            <Button size="sm" onClick={() => navigate('/auth')}>
              Sign in or create an account
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Flyer scan (step 0 only, event/venue) */}
      {supportsScan && currentStep === 0 && user && (
        <FlyerScanUpload
          scanState={flyerScan.scanState}
          error={flyerScan.error}
          currentFileIndex={flyerScan.currentFileIndex}
          totalFiles={flyerScan.totalFiles}
          onFilesSelected={handleStartScan}
          onReset={handleResetScan}
        >
          {flyerScan.results.length > 0 && (
            <FlyerScanResults
              results={flyerScan.results}
              selectedVenueId={selectedVenueId}
              onSelectVenue={setSelectedVenueId}
              onApply={handleApplyScan}
              onDismiss={flyerScan.reset}
            />
          )}
        </FlyerScanUpload>
      )}

      {/* Step indicator (only for multi-step forms) */}
      {totalSteps > 1 && (
        <div className="flex items-center gap-2 mb-6">
          {config.steps.map((step, i) => (
            <div
              key={step.id}
              className="flex items-center gap-2"
              style={{ flex: i < config.steps.length - 1 ? 1 : undefined }}
            >
              {/* Step circle */}
              <div
                onClick={() => i < currentStep && goToStep(i)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all flex-shrink-0"
                style={{
                  cursor: i < currentStep ? 'pointer' : 'default',
                  ...(i === currentStep
                    ? { backgroundColor: config.color, color: 'hsl(var(--background))' }
                    : i < currentStep
                      ? { backgroundColor: `${config.color}25`, color: config.color }
                      : { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }),
                }}
              >
                {i < currentStep ? '✓' : i + 1}
              </div>

              {/* Step label (hidden on mobile) */}
              <span
                className={`text-xs whitespace-nowrap hidden sm:block ${
                  i === currentStep ? 'font-semibold text-foreground' : 'font-normal text-muted-foreground'
                }`}
              >
                {step.label}
              </span>

              {/* Connector line */}
              {i < config.steps.length - 1 && (
                <div
                  className="flex-1 h-0.5 rounded mx-1 min-w-4"
                  style={{
                    backgroundColor: i < currentStep ? config.color : 'hsl(var(--border))',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step-level aria-live region for validation announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="submit-form-announcer"
        className="sr-only"
      >
        {stepAnnouncement}
      </div>

      {/* Form card */}
      <Card>
        <CardContent>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (isLastStep) {
                submit();
                return;
              }
              const result = await nextStep();
              if (!result.ok && result.firstInvalid) {
                requestAnimationFrame(() => {
                  const el = document.getElementById(result.firstInvalid as string);
                  if (el) {
                    (el as HTMLElement).focus();
                    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }
                });
              }
            }}
          >
            {/* Honeypot — hidden from real users */}
            <div className="absolute -left-[9999px] opacity-0 h-0 overflow-hidden">
              <Input
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {/* Step label */}
            {totalSteps > 1 && (
              <p className="text-sm font-semibold mb-4" style={{ color: config.color }}>
                Step {currentStep + 1}: {currentStepConfig?.label}
              </p>
            )}

            {/* Error summary — lists fields that need fixing on this step */}
            {(() => {
              const stepErrors = stepFields
                .map((f) => ({ name: f.name, label: f.label, message: errors[f.name] }))
                .filter((e) => !!e.message);
              if (stepErrors.length === 0) return null;
              return (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-4 p-3 rounded"
                  style={{
                    backgroundColor: 'hsl(var(--destructive) / 0.08)',
                    border: '1px solid hsl(var(--destructive) / 0.35)',
                  }}
                >
                  <p className="text-sm font-semibold mb-1 text-destructive">
                    Please fix the following to continue:
                  </p>
                  <ul className="m-0 pl-4">
                    {stepErrors.map((e) => (
                      <li key={e.name}>
                        <a
                          href={`#${e.name}`}
                          onClick={(ev: React.MouseEvent) => {
                            ev.preventDefault();
                            const el = document.getElementById(e.name);
                            if (el) {
                              (el as HTMLElement).focus();
                              el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                            }
                          }}
                          className="text-destructive underline cursor-pointer"
                        >
                          {e.label}: {e.message}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* Live region for step announcements (a11y) */}
            <div role="status" aria-live="polite" className="sr-only">
              {stepAnnouncement}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {stepFields.map((fieldConfig) => (
                <div
                  key={fieldConfig.name}
                  style={{ gridColumn: fieldConfig.colSpan === 2 ? '1 / -1' : undefined }}
                >
                  <Controller
                    control={control}
                    name={fieldConfig.name}
                    render={({ field, fieldState }) => (
                      <FieldRenderer
                        field={fieldConfig}
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        error={fieldState.error?.message ?? errors[fieldConfig.name]}
                        setFields={setFields}
                        allValues={data}
                      />
                    )}
                  />
                </div>
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between mt-6 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={currentStep === 0 ? () => navigate('/submit') : prevStep}
                className="flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                {currentStep === 0 ? 'Cancel' : 'Back'}
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                aria-describedby={!user && isLastStep ? 'submit-auth-hint' : undefined}
                className="flex items-center gap-1.5"
                style={isLastStep ? { backgroundColor: config.color, color: 'hsl(var(--background))' } : undefined}
              >
                {isSubmitting ? (
                  'Submitting...'
                ) : isLastStep ? (
                  <>
                    Submit <Send className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default SubmitForm;
