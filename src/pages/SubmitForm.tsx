/**
 * SubmitForm — /submit/:contentType
 * Generic multi-step submission form that reuses CMS FieldRenderer.
 */

import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router';
import { useMemo, useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submissionRegistry } from '@/config/submissionRegistry';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { useSubmission } from '@/hooks/useSubmission';
import { useAuth } from '@/hooks/useAuth';
import { useFlyerScan } from '@/hooks/useFlyerScan';
import { FieldRenderer } from '@/components/cms/fields/FieldRenderer';
import { FlyerScanUpload } from '@/components/submission/FlyerScanUpload';
import { FlyerScanResults } from '@/components/submission/FlyerScanResults';
import { ArrowLeft, ArrowRight, CheckCircle, Send } from 'lucide-react';

const SubmitForm = () => {
  const { contentType } = useParams<{ contentType: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const config = contentType ? submissionRegistry[contentType] : undefined;

  // Unknown type fallback
  if (!config) {
    return (
      <Box sx={{ maxWidth: '40rem', mx: 'auto', py: 6, px: 2, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          Unknown submission type
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          The submission type "{contentType}" is not supported.
        </Typography>
        <Button onClick={() => navigate('/submit')}>Back to Hub</Button>
      </Box>
    );
  }

  return <SubmitFormInner config={config} />;
};

// ── Inner form component (only renders when config is valid) ──────

interface SubmitFormInnerProps {
  config: NonNullable<(typeof submissionRegistry)[string]>;
}

function SubmitFormInner({ config }: SubmitFormInnerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const contentConfig = contentTypeRegistry[config.contentType];

  const {
    data,
    errors,
    currentStep,
    isSubmitting,
    isSubmitted,
    totalSteps,
    setField,
    setFields,
    nextStep,
    prevStep,
    goToStep,
    submit,
    reset,
    honeypot,
    setHoneypot,
  } = useSubmission(config);

  // Flyer scan (only for event/venue)
  const supportsScan = config.id === 'event' || config.id === 'venue';
  const flyerScan = useFlyerScan();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  // Reset venue selection when a new scan starts or scan is reset
  const handleStartScan = (file: File) => {
    setSelectedVenueId(null);
    flyerScan.startScan(file);
  };
  const handleResetScan = () => {
    setSelectedVenueId(null);
    flyerScan.reset();
  };

  const handleApplyScan = () => {
    const formData = flyerScan.applyToForm(selectedVenueId ?? undefined);
    setFields(formData);

    // If detected type differs from current form, navigate to correct form
    if (flyerScan.detectedType && flyerScan.detectedType !== config.id) {
      navigate(`/submit/${flyerScan.detectedType}`, {
        state: { prefill: formData, imageUrl: flyerScan.imageUrl },
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
      <Box sx={{ maxWidth: '40rem', mx: 'auto', py: 6, px: 2 }}>
        <Card>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <CheckCircle
              style={{ width: 48, height: 48, margin: '0 auto 16px', color: '#4caf50' }}
            />
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
              Thank you!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Your {config.label.toLowerCase()} has been submitted and will be reviewed by our team.
              It will appear on the site once approved.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
              <Button onClick={() => navigate('/submit')}>Submit More</Button>
              <Button variant="outline" onClick={reset}>
                Submit Another {config.label}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const Icon = config.icon;

  return (
    <Box sx={{ maxWidth: '40rem', mx: 'auto', py: 4, px: 2 }}>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/submit')}
        style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        All Submissions
      </Button>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Icon style={{ width: 28, height: 28, color: config.color }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Submit {config.label}
        </Typography>
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {config.description}
      </Typography>

      {/* Auth gate */}
      {!user && (
        <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Tip:</strong>{' '}
              <Box
                component="span"
                onClick={() => navigate('/auth')}
                sx={{ color: 'text.primary', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Sign in or create an account
              </Box>{' '}
              to submit content directly. Guest submissions are not currently supported.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Flyer scan (step 0 only, event/venue) */}
      {supportsScan && currentStep === 0 && user && (
        <FlyerScanUpload
          scanState={flyerScan.scanState}
          error={flyerScan.error}
          onFileSelected={handleStartScan}
          onReset={handleResetScan}
        >
          {flyerScan.result && flyerScan.detectedType && (
            <FlyerScanResults
              result={flyerScan.result}
              detectedType={flyerScan.detectedType}
              imageUrl={flyerScan.imageUrl}
              selectedVenueId={selectedVenueId}
              onSelectVenue={setSelectedVenueId}
              onChangeType={flyerScan.setDetectedType}
              onApply={handleApplyScan}
              onDismiss={flyerScan.reset}
            />
          )}
        </FlyerScanUpload>
      )}

      {/* Step indicator (only for multi-step forms) */}
      {totalSteps > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          {config.steps.map((step, i) => (
            <Box
              key={step.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flex: i < config.steps.length - 1 ? 1 : undefined,
              }}
            >
              {/* Step circle */}
              <Box
                onClick={() => i < currentStep && goToStep(i)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  cursor: i < currentStep ? 'pointer' : 'default',
                  flexShrink: 0,
                  ...(i === currentStep
                    ? { bgcolor: config.color, color: '#fff' }
                    : i < currentStep
                      ? { bgcolor: `${config.color}25`, color: config.color }
                      : { bgcolor: 'action.hover', color: 'text.disabled' }),
                }}
              >
                {i < currentStep ? '✓' : i + 1}
              </Box>

              {/* Step label (hidden on mobile) */}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: i === currentStep ? 600 : 400,
                  color: i === currentStep ? 'text.primary' : 'text.secondary',
                  display: { xs: 'none', sm: 'block' },
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </Typography>

              {/* Connector line */}
              {i < config.steps.length - 1 && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    bgcolor: i < currentStep ? config.color : 'divider',
                    borderRadius: 1,
                    mx: 0.5,
                    minWidth: 16,
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Form card */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isLastStep) submit();
              else nextStep();
            }}
          >
            {/* Honeypot — hidden from real users */}
            <Box
              sx={{ position: 'absolute', left: -9999, opacity: 0, height: 0, overflow: 'hidden' }}
            >
              <Input
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </Box>

            {/* Step label */}
            {totalSteps > 1 && (
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: config.color }}>
                Step {currentStep + 1}: {currentStepConfig?.label}
              </Typography>
            )}

            {/* Fields */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2.5,
              }}
            >
              {stepFields.map((fieldConfig) => (
                <Box
                  key={fieldConfig.name}
                  sx={{ gridColumn: fieldConfig.colSpan === 2 ? '1 / -1' : undefined }}
                >
                  <FieldRenderer
                    field={fieldConfig}
                    value={data[fieldConfig.name] ?? ''}
                    onChange={(val) => setField(fieldConfig.name, val)}
                    error={errors[fieldConfig.name]}
                    setFields={setFields}
                  />
                </Box>
              ))}
            </Box>

            {/* Navigation buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, gap: 1.5 }}>
              <Button
                type="button"
                variant="outline"
                onClick={currentStep === 0 ? () => navigate('/submit') : prevStep}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <ArrowLeft style={{ width: 16, height: 16 }} />
                {currentStep === 0 ? 'Cancel' : 'Back'}
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting || !user}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  ...(isLastStep ? { backgroundColor: config.color, color: '#fff' } : {}),
                }}
              >
                {isSubmitting ? (
                  'Submitting...'
                ) : isLastStep ? (
                  <>
                    Submit <Send style={{ width: 14, height: 14 }} />
                  </>
                ) : (
                  <>
                    Next <ArrowRight style={{ width: 14, height: 14 }} />
                  </>
                )}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

export default SubmitForm;
