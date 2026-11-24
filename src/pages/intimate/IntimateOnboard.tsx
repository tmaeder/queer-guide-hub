import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import {
  useIntimateKinkTags,
  useMyIntimateProfile,
  useMyIntimateText,
  useSetIntimateText,
  useUpsertIntimateProfile,
} from '@/hooks/useIntimateProfile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { INTO_TAGS as FALLBACK_INTO } from '@/assets/intimate/options';
import { getGenitalPictogramSet } from '@/assets/intimate/pictograms';
import type { IntimateProfile, WizardStep } from '@/lib/intimate/types';
import { IntimateStepFields } from '@/components/intimate/IntimateStepFields';
import { StepperShell, type StepperStep } from '@/components/ui/StepperShell';
import { FlatFieldGroup, FlatField } from '@/components/ui/FlatFieldGroup';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { MeetNavBar } from '@/components/meet/MeetNav';

const STEP_ORDER: WizardStep[] = [
  'consent',
  'genitalia',
  'genital-pictogram',
  'size',
  'angle',
  'body-pictogram',
  'body-type',
  'age',
  'height',
  'role',
  'safer-sex',
  'text',
  'review',
];

const STEP_LABELS: Record<WizardStep, string> = {
  consent: 'Consent',
  genitalia: 'Genitalia',
  'genital-pictogram': 'Anatomy',
  size: 'Size',
  angle: 'Angle',
  'body-pictogram': 'Body',
  'body-type': 'Body type',
  age: 'Age band',
  height: 'Height',
  role: 'Role',
  into: 'Into',
  'safer-sex': 'Safer sex',
  seeking: 'Who you are looking for',
  text: 'About',
  review: 'Review',
};

const STEP_DESCRIPTIONS: Partial<Record<WizardStep, string>> = {
  consent:
    'This section is 18+. Your intimate profile stays invisible until you complete it, and only opted-in users can see it.',
  genitalia: 'Pick what applies to you.',
  size: 'Approximate size in centimeters.',
  angle: 'Erection angle.',
  'body-type': 'How would you describe your build?',
  age: 'Pick an age band — exact age is never shown.',
  role: 'You can pick more than one.',
  into: 'What turns you on.',
  'safer-sex': 'Your safer-sex preferences.',
  text: 'Free-text fields are encrypted at rest and scanned by automated moderation.',
  review: 'Activating makes your profile visible to other opted-in users.',
};

type Draft = Partial<IntimateProfile>;

export default function IntimateOnboard() {
  const { user } = useAuth();
  const { data: existing, isLoading } = useMyIntimateProfile();
  const { data: existingText } = useMyIntimateText();
  const { data: kinkTags } = useIntimateKinkTags();
  const upsert = useUpsertIntimateProfile();
  const setText = useSetIntimateText();

  const kinkVocab: readonly string[] = kinkTags?.length
    ? kinkTags.map((t) => t.slug)
    : (FALLBACK_INTO as readonly string[]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { affirmed, affirm } = useAgeAffirmation();

  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [consent, setConsent] = useState(false);
  const [aboutText, setAboutText] = useState('');
  const [lookingText, setLookingText] = useState('');

  useEffect(() => {
    if (existingText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setAboutText(existingText.about_intimate ?? '');
      setLookingText(existingText.looking_for ?? '');
    }
  }, [existingText]);

  const draftG = draft.genitalia ?? existing?.genitalia;
  const showAngle = draftG === 'penis';
  // The anatomy-pictogram step only exists when the chosen genitalia has a
  // pictogram set (none for "prefer not to say" / nothing selected) — otherwise
  // it renders an empty grid.
  const hasPictograms = Object.keys(getGenitalPictogramSet(draftG ?? null)).length > 0;
  const hasAgeConsent = affirmed || !!existing?.consent_18plus_at;
  const visibleSteps = useMemo(
    () =>
      STEP_ORDER.filter((s) => {
        if (s === 'consent') return !hasAgeConsent;
        if (s === 'angle' || s === 'size') return showAngle;
        if (s === 'genital-pictogram') return hasPictograms;
        return true;
      }),
    [showAngle, hasPictograms, hasAgeConsent],
  );
  const step =
    visibleSteps.find((candidate) => STEP_ORDER.indexOf(candidate) >= stepIdx) ??
    visibleSteps[visibleSteps.length - 1];

  const stepperSteps: StepperStep[] = useMemo(
    () =>
      visibleSteps.map((s) => ({
        id: s,
        label: STEP_LABELS[s],
        description: STEP_DESCRIPTIONS[s],
      })),
    [visibleSteps],
  );

  if (isLoading) {
    return (
      <>
        <MeetNavBar />
        <PageContainer size="form">
          <PageLoadingState count={2} variant="list" label="Loading your intimate profile" />
        </PageContainer>
      </>
    );
  }
  if (!user) {
    return (
      <>
        <MeetNavBar />
        <PageContainer size="form" className="text-center">
          <h1 className="font-display text-headline">Intimate profile</h1>
          <p className="mt-4 text-muted-foreground">Sign in to continue.</p>
          <Button className="mt-6" onClick={() => navigate('/auth')}>
            Sign in
          </Button>
        </PageContainer>
      </>
    );
  }

  const visibleIdx = visibleSteps.indexOf(step);
  const isLast = visibleIdx === visibleSteps.length - 1;

  const next = () => {
    if (isLast) return submit();
    const nextStep = visibleSteps[visibleIdx + 1];
    setStepIdx(STEP_ORDER.indexOf(nextStep));
  };
  const back = () => {
    if (visibleIdx > 0) {
      const prevStep = visibleSteps[visibleIdx - 1];
      setStepIdx(STEP_ORDER.indexOf(prevStep));
    }
  };

  const update = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));
  const merged = { ...existing, ...draft } as Draft;

  const submit = async () => {
    try {
      await upsert.mutateAsync({
        ...draft,
        consent_18plus_at: existing?.consent_18plus_at ?? new Date().toISOString(),
        opted_in_at: new Date().toISOString(),
      });
      await setText.mutateAsync({
        aboutIntimate: aboutText.trim() || null,
        lookingFor: lookingText.trim() || null,
      });
      toast({ title: 'Intimate profile activated' });
      navigate('/meet/dating');
    } catch (e) {
      toast({ title: 'Could not save', description: String(e), variant: 'destructive' });
    }
  };

  const canGoNext = step === 'consent' ? consent : true;

  return (
    <>
      <MeetNavBar />
      <StepperShell
        steps={stepperSteps}
        current={visibleIdx}
        onPrev={back}
        onNext={next}
        canGoPrev={visibleIdx > 0}
        canGoNext={canGoNext}
        nextLabel={isLast ? (upsert.isPending ? 'Activating…' : 'Activate') : 'Next'}
        variant="discreet"
      >
        <FlatFieldGroup title={STEP_LABELS[step]} description={STEP_DESCRIPTIONS[step]} noTopBorder>
          {step === 'consent' && (
            <FlatField>
              <label htmlFor="intimate-consent" className="flex items-start gap-4 cursor-pointer">
                <Checkbox
                  id="intimate-consent"
                  checked={consent}
                  onCheckedChange={(v) => {
                    const next = v === true;
                    setConsent(next);
                    if (next) void affirm();
                  }}
                  className="rounded-element mt-0.5"
                />
                <span className="text-sm leading-relaxed">
                  I confirm I am at least 18 years old and consent to seeing explicit content.
                </span>
              </label>
            </FlatField>
          )}

          {step !== 'consent' && step !== 'review' && (
            <IntimateStepFields
              step={step}
              merged={merged}
              update={update}
              kinkVocab={kinkVocab}
              aboutText={aboutText}
              setAboutText={setAboutText}
              lookingText={lookingText}
              setLookingText={setLookingText}
              textParts="looking"
            />
          )}

          {step === 'review' && (
            <dl className="space-y-4 text-sm">
              {merged.genitalia && <Row k="Genitalia" v={merged.genitalia} />}
              {merged.size_cm && <Row k="Size" v={`${merged.size_cm} cm`} />}
              {merged.erection_angle_deg !== undefined && merged.erection_angle_deg !== null && (
                <Row k="Angle" v={`${merged.erection_angle_deg}°`} />
              )}
              {merged.body_type && <Row k="Body" v={merged.body_type} />}
              {merged.age_band && <Row k="Age" v={merged.age_band} />}
              {merged.height_cm && <Row k="Height" v={`${merged.height_cm} cm`} />}
              {merged.role?.length ? <Row k="Role" v={merged.role.join(', ')} /> : null}
            </dl>
          )}
        </FlatFieldGroup>
      </StepperShell>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between pt-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
