/**
 * SubmitForm — /submit/:contentType
 * Generic multi-step submission form that reuses CMS FieldRenderer.
 */

import { useParams, useLocation } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Controller } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submissionRegistry } from '@/config/submissionRegistry';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { placeSubmissionContentType } from '@/config/contentTypes/place';
import { useSubmission } from '@/hooks/useSubmission';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchCountryNameById } from '@/hooks/usePageFetchers';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { DuplicateWarning } from '@/components/submission/DuplicateWarning';
import { useDuplicateCheck } from '@/hooks/submission/useDuplicateCheck';
import { SeriesCarryover } from '@/components/submission/SeriesCarryover';
import { useEventSeries, cloneFieldsFromEdition } from '@/hooks/submission/useEventSeries';
import { EventSeriesFields } from '@/components/submission/EventSeriesFields';
import { ArrowLeft, ArrowRight, CheckCircle, Send } from 'lucide-react';
import { useEventTypeOptions } from '@/lib/eventTypes';
import { PageContainer } from '@/components/layout/PageContainer';
import { useTranslation } from 'react-i18next';

interface SubmitFormProps {
  contentType?: string;
  embedded?: boolean;
  onBack?: () => void;
}

const SubmitForm = ({
  contentType: contentTypeProp,
  embedded = false,
  onBack,
}: SubmitFormProps = {}) => {
  const { contentType: paramContentType } = useParams<{ contentType: string }>();
  const location = useLocation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  // Resolve the submission type. Static `submit/<slug>` routes pass it as a
  // prop and carry no :contentType param; the dynamic `submit/:contentType`
  // route supplies it via useParams. Prefer the explicit prop, then the URL
  // param, then the last path segment so static routes (news/feedback, which
  // outrank the /:locale? collision) still resolve instead of showing
  // "Unknown submission type".
  const contentType =
    contentTypeProp ?? paramContentType ?? location.pathname.split('/').filter(Boolean).pop();

  const config = contentType ? submissionRegistry[contentType] : undefined;

  // Unknown type fallback
  if (!config) {
    return (
      <SubmitFormLayout embedded={embedded} className="text-center">
        <h5 className="text-xl font-semibold mb-2">
          {t('contributeForm.unknownType', 'Unknown submission type')}
        </h5>
        <p className="text-muted-foreground mb-4">
          {t('contributeForm.unknownBody', 'The submission type "{{type}}" is not supported.', {
            type: contentType,
          })}
        </p>
        <Button onClick={() => navigate('/submit')}>
          {t('contributeForm.backHub', 'Back to contributions')}
        </Button>
      </SubmitFormLayout>
    );
  }

  if (!user) {
    return (
      <SubmitFormLayout embedded={embedded}>
        <Card role="status">
          <CardContent className="pt-6">
            <p className="font-semibold">
              {t('contributeForm.signInRequired', 'Sign in required')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                'contributeForm.authBody',
                'Sign in before adding directory content. The form is unavailable to guests.',
              )}
            </p>
            <div className="mt-6 flex gap-4">
              <Button variant="outline" onClick={onBack ?? (() => navigate('/submit'))}>
                <ArrowLeft className="h-4 w-4" /> {t('contribute.common.back', 'Back')}
              </Button>
              <Button onClick={() => navigate('/auth')}>
                {t('contribute.auth.cta', 'Sign in or create an account')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </SubmitFormLayout>
    );
  }

  return <SubmitFormInner config={config} embedded={embedded} onBack={onBack} />;
};

// ── Inner form component (only renders when config is valid) ──────

interface SubmitFormInnerProps {
  config: NonNullable<(typeof submissionRegistry)[string]>;
  embedded: boolean;
  onBack?: () => void;
}

function SubmitFormInner({ config, embedded, onBack }: SubmitFormInnerProps) {
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();
  const contentConfig =
    contentTypeRegistry[config.contentType] ??
    (config.id === 'place' ? placeSubmissionContentType : undefined);

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

  // Non-blocking "already exists?" lookup on the typed title/name.
  const { matches: duplicateMatches } = useDuplicateCheck(config.id, titleValue);

  // "Eventreihen" carry-over — offer to clone a past edition (events only).
  const { editions: previousEditions } = useEventSeries(
    config.id === 'event',
    titleValue,
    String(data.city ?? ''),
  );

  const eventTypeOptions = useEventTypeOptions();

  // Resolve FieldConfig objects from a list of field names
  const resolveFields = useCallback(
    (fieldNames: string[]) => {
      if (!contentConfig) return [];
      return fieldNames
        .map((fieldName) => contentConfig.fields.find((f) => f.name === fieldName))
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
        .map((f) => ({
          ...f,
          // Override CMS-specific flags — submission fields are always editable & visible
          readOnly: false,
          hidden: false,
          // Inject translated labels for event_type (canonical 19-value list)
          ...(f.name === 'event_type' ? { options: eventTypeOptions } : {}),
        }));
    },
    [contentConfig, eventTypeOptions],
  );

  // Current step's fields (wizard mode)
  const stepFields = useMemo(
    () => (currentStepConfig ? resolveFields(currentStepConfig.fields) : []),
    [currentStepConfig, resolveFields],
  );

  // ── Success screen ─────────────────────────────────────────────

  if (isSubmitted) {
    const typeLabel = t(`contributeForm.types.${config.id}`, config.label);
    return (
      <SubmitFormLayout embedded={embedded}>
        <Card>
          <CardContent>
            <CheckCircle size={48} style={{ margin: '0 auto 16px' }} className="text-foreground" />
            <h5 className="text-xl font-semibold mb-2">
              {t('contribute.feedback.thanks', 'Thank you!')}
            </h5>
            <p className="text-muted-foreground mb-6">
              {t(
                'contributeForm.submittedBody',
                'Your {{type}} has been submitted and will be reviewed before publishing.',
                { type: typeLabel.toLocaleLowerCase() },
              )}
            </p>
            <div className="flex justify-center gap-4">
              <Button onClick={onBack ?? (() => navigate('/submit'))}>
                {t('contributeForm.submitMore', 'Submit more')}
              </Button>
              <Button variant="outline" onClick={reset}>
                {t('contributeForm.submitAnother', 'Submit another {{type}}', {
                  type: typeLabel,
                })}
              </Button>
            </div>
          </CardContent>
        </Card>
      </SubmitFormLayout>
    );
  }

  const Icon = config.icon;
  const typeLabel = t(`contributeForm.types.${config.id}`, config.label);

  return (
    <SubmitFormLayout embedded={embedded}>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack ?? (() => navigate('/submit'))}
        className="mb-4 flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('contributeForm.allSubmissions', 'All submissions')}
      </Button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <Icon className="text-foreground" style={{ width: 28, height: 28 }} />
        <h4 className="text-3xl font-bold">
          {t('contributeForm.submitType', 'Submit {{type}}', { type: typeLabel })}
        </h4>
      </div>

      {/* Series carry-over (events) + non-blocking duplicate warning on the first step */}
      {currentStep === 0 && (
        <>
          <SeriesCarryover
            editions={previousEditions}
            onClone={(edition) => setFields(cloneFieldsFromEdition(edition))}
          />
          <DuplicateWarning
            submissionTypeId={config.id}
            typeLabel={config.label}
            matches={duplicateMatches}
          />
        </>
      )}

      {/* Step indicator */}
      {totalSteps > 1 && (
        <div className="flex items-center gap-2 mb-6">
          {config.steps.map((step, i) => (
            <div
              key={step.id}
              className="flex items-center gap-2"
              style={{ flex: i < config.steps.length - 1 ? 1 : undefined }}
            >
              {/* Step circle */}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- role/tabIndex applied conditionally when i < currentStep (past step) */}
              <div
                onClick={() => i < currentStep && goToStep(i)}
                onKeyDown={
                  i < currentStep
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToStep(i);
                        }
                      }
                    : undefined
                }
                role={i < currentStep ? 'button' : undefined}
                tabIndex={i < currentStep ? 0 : undefined}
                aria-label={
                  i < currentStep
                    ? t('contributeForm.returnStep', 'Return to step {{step}}', { step: i + 1 })
                    : undefined
                }
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all flex-shrink-0"
                style={{
                  cursor: i < currentStep ? 'pointer' : 'default',
                  ...(i === currentStep
                    ? {
                        backgroundColor: 'hsl(var(--foreground))',
                        color: 'hsl(var(--background))',
                      }
                    : i < currentStep
                      ? { backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--foreground))' }
                      : {
                          backgroundColor: 'hsl(var(--muted))',
                          color: 'hsl(var(--muted-foreground))',
                        }),
                }}
              >
                {i < currentStep ? '✓' : i + 1}
              </div>

              {/* Step label (hidden on mobile) */}
              <span
                className={`text-xs whitespace-nowrap hidden sm:block ${
                  i === currentStep
                    ? 'font-semibold text-foreground'
                    : 'font-normal text-muted-foreground'
                }`}
              >
                {t(`contributeForm.steps.${step.id}`, step.label)}
              </span>

              {/* Connector line */}
              {i < config.steps.length - 1 && (
                <div
                  className="flex-1 h-0.5 rounded-badge mx-1 min-w-4"
                  style={{
                    backgroundColor:
                      i < currentStep ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
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
              <p className="text-sm font-semibold mb-4 text-foreground">
                {t('contributeForm.step', 'Step {{step}}: {{label}}', {
                  step: currentStep + 1,
                  label: currentStepConfig
                    ? t(`contributeForm.steps.${currentStepConfig.id}`, currentStepConfig.label)
                    : '',
                })}
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
                  className="mb-4 rounded-container p-4 shadow-soft"
                  style={{
                    backgroundColor: 'hsl(var(--destructive) / 0.08)',
                  }}
                >
                  <p className="text-sm font-semibold mb-1 text-destructive">
                    {t('contributeForm.fixErrors', 'Please fix the following to continue:')}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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

            {/* Event recurrence + festival grouping (on the When & Where step) */}
            {config.id === 'event' && currentStepConfig?.id === 'when-where' && (
              <div className="mt-8 pt-6">
                <EventSeriesFields data={data} setFields={setFields} />
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between mt-6 gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={currentStep === 0 ? (onBack ?? (() => navigate('/submit'))) : prevStep}
                className="flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                {currentStep === 0
                  ? t('contributeForm.cancel', 'Cancel')
                  : t('contribute.common.back', 'Back')}
              </Button>

              <Button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5">
                {isSubmitting ? (
                  t('contribute.common.submitting', 'Submitting…')
                ) : isLastStep ? (
                  <>
                    {t('contribute.common.submit', 'Submit')} <Send className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    {t('contributeForm.next', 'Next')} <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </SubmitFormLayout>
  );
}

function SubmitFormLayout({
  embedded,
  className,
  children,
}: {
  embedded: boolean;
  className?: string;
  children: ReactNode;
}) {
  return embedded ? (
    <div className={className}>{children}</div>
  ) : (
    <PageContainer className={className}>{children}</PageContainer>
  );
}

export default SubmitForm;
