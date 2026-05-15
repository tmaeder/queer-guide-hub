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
import { useVerifiedEmail } from '@/hooks/useIntimateActions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  AGE_BANDS, BODY_TYPES, GENITALIA_OPTIONS, INTO_TAGS as FALLBACK_INTO, LIMITS as FALLBACK_LIMITS, ROLES, SAFER_SEX_PREFS, SIZE_CM_OPTIONS,
} from '@/assets/intimate/options';
import {
  angleOptions, bodyPictograms, getGenitalPictogramSet,
} from '@/assets/intimate/pictograms';
import type { Genitalia, IntimateProfile, WizardStep } from '@/lib/intimate/types';
import { StepperShell, type StepperStep } from '@/components/ui/StepperShell';
import { FlatFieldGroup, FlatField } from '@/components/ui/FlatFieldGroup';

const STEP_ORDER: WizardStep[] = [
  'consent','genitalia','genital-pictogram','size','angle','body-pictogram','body-type',
  'age','height','role','into','limits','safer-sex','text','review',
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
  limits: 'Limits',
  'safer-sex': 'Safer sex',
  text: 'About',
  review: 'Review',
};

const STEP_DESCRIPTIONS: Partial<Record<WizardStep, string>> = {
  consent: 'This section is 18+. Your intimate profile stays invisible until you complete it, and only opted-in users can see it.',
  genitalia: 'Pick what applies to you.',
  size: 'Approximate size in centimeters.',
  angle: 'Erection angle.',
  'body-type': 'How would you describe your build?',
  age: 'Pick an age band — exact age is never shown.',
  role: 'You can pick more than one.',
  into: 'What turns you on.',
  limits: "Hard limits — what's off the table.",
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

  const { data: verifiedEmail } = useVerifiedEmail();

  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [consent, setConsent] = useState(false);
  const [aboutText, setAboutText] = useState('');
  const [lookingText, setLookingText] = useState('');

  useEffect(() => {
    if (existingText) {
      setAboutText(existingText.about_intimate ?? '');
      setLookingText(existingText.looking_for ?? '');
    }
  }, [existingText]);

  const step = STEP_ORDER[stepIdx];
  const draftG = draft.genitalia ?? existing?.genitalia;
  const showAngle = draftG === 'penis';
  const visibleSteps = useMemo(
    () => STEP_ORDER.filter((s) => (s === 'angle' || s === 'size') ? showAngle : true),
    [showAngle],
  );

  const stepperSteps: StepperStep[] = useMemo(
    () =>
      visibleSteps.map((s) => ({
        id: s,
        label: STEP_LABELS[s],
        description: STEP_DESCRIPTIONS[s],
      })),
    [visibleSteps],
  );

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!user) return <div className="p-8">Sign in to continue.</div>;
  if (verifiedEmail === false) {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="mb-4 text-2xl">Verify your email first</h1>
        <p className="mb-6 text-muted-foreground">
          The intimate profile is only available to users with a verified email address.
        </p>
        <Button onClick={() => navigate('/settings/profile')}>Go to settings</Button>
      </div>
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
      navigate('/intimate');
    } catch (e) {
      toast({ title: 'Could not save', description: String(e), variant: 'destructive' });
    }
  };

  const canGoNext = step === 'consent' ? consent : true;

  return (
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
      <FlatFieldGroup
        title={STEP_LABELS[step]}
        description={STEP_DESCRIPTIONS[step]}
        noTopBorder
      >
        {step === 'consent' && (
          <FlatField>
            <label htmlFor="intimate-consent" className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                id="intimate-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="rounded-element mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I confirm I am at least 18 years old and consent to seeing explicit content.
              </span>
            </label>
          </FlatField>
        )}

        {step === 'genitalia' && (
          <FlatField>
            <div className="flex flex-wrap gap-2">
              {GENITALIA_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  variant={merged.genitalia === o.value ? 'default' : 'outline'}
                  onClick={() => update({ genitalia: o.value as Genitalia })}
                  className="rounded-element"
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </FlatField>
        )}

        {step === 'genital-pictogram' && (
          <PictogramGrid
            picks={getGenitalPictogramSet(merged.genitalia ?? null)}
            selected={merged.genital_pictogram_key ?? null}
            onSelect={(k) => update({ genital_pictogram_key: k })}
          />
        )}

        {step === 'size' && (
          <NumberPicker
            label="Size (cm)"
            options={SIZE_CM_OPTIONS}
            value={merged.size_cm ?? null}
            onSelect={(v) => update({ size_cm: v })}
          />
        )}

        {step === 'angle' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-border divide-x divide-border">
            {angleOptions.map(({ key, label, deg, Picto }) => {
              const selected = merged.erection_angle_deg === deg;
              return (
                <button
                  key={key}
                  onClick={() => update({ erection_angle_deg: deg })}
                  className={`p-4 flex flex-col items-center gap-2 transition-colors ${
                    selected ? 'bg-foreground/5' : 'hover:bg-muted/40'
                  }`}
                  aria-label={`Angle ${label}`}
                  aria-pressed={selected}
                >
                  <Picto width={56} height={56} />
                  <div className="text-xs text-muted-foreground">{label}</div>
                </button>
              );
            })}
          </div>
        )}

        {step === 'body-pictogram' && (
          <PictogramGrid
            picks={bodyPictograms}
            selected={merged.body_pictogram_key ?? null}
            onSelect={(k) => update({ body_pictogram_key: k })}
          />
        )}

        {step === 'body-type' && (
          <ChipPicker
            options={BODY_TYPES as readonly string[]}
            selected={merged.body_type ? [merged.body_type] : []}
            onToggle={(v) => update({ body_type: v })}
            single
          />
        )}

        {step === 'age' && (
          <ChipPicker
            options={AGE_BANDS as readonly string[]}
            selected={merged.age_band ? [merged.age_band] : []}
            onToggle={(v) => update({ age_band: v })}
            single
          />
        )}

        {step === 'height' && (
          <FlatField label="Height (cm)" htmlFor="h">
            <Input
              id="h"
              type="number"
              min={100}
              max={250}
              value={merged.height_cm ?? ''}
              onChange={(e) =>
                update({ height_cm: e.target.value ? Number(e.target.value) : null })
              }
              className="rounded-element max-w-xs"
            />
          </FlatField>
        )}

        {step === 'role' && (
          <ChipPicker
            options={ROLES as readonly string[]}
            selected={merged.role ?? []}
            onToggle={(v) =>
              update({ role: toggleIn(merged.role ?? [], v) })
            }
          />
        )}

        {step === 'into' && (
          <ChipPicker
            options={kinkVocab}
            selected={merged.into_tags ?? []}
            onToggle={(v) =>
              update({ into_tags: toggleIn(merged.into_tags ?? [], v) })
            }
          />
        )}

        {step === 'limits' && (
          <ChipPicker
            options={kinkTags?.length ? kinkVocab : (FALLBACK_LIMITS as readonly string[])}
            selected={merged.limits ?? []}
            onToggle={(v) =>
              update({ limits: toggleIn(merged.limits ?? [], v) })
            }
          />
        )}

        {step === 'safer-sex' && (
          <ChipPicker
            options={SAFER_SEX_PREFS as readonly string[]}
            selected={merged.safer_sex_prefs ?? []}
            onToggle={(v) =>
              update({
                safer_sex_prefs: toggleIn(merged.safer_sex_prefs ?? [], v),
              })
            }
          />
        )}

        {step === 'text' && (
          <>
            <FlatField label="About me (optional)" htmlFor="about">
              <Textarea
                id="about"
                maxLength={1000}
                placeholder="A few lines about you."
                value={aboutText}
                onChange={(e) => setAboutText(e.target.value)}
                className="rounded-element"
              />
            </FlatField>
            <FlatField label="Looking for (optional)" htmlFor="looking">
              <Textarea
                id="looking"
                maxLength={500}
                placeholder="What are you into right now?"
                value={lookingText}
                onChange={(e) => setLookingText(e.target.value)}
                className="rounded-element"
              />
            </FlatField>
          </>
        )}

        {step === 'review' && (
          <dl className="space-y-3 text-sm">
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
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-t border-border pt-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function toggleIn(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function PictogramGrid({
  picks, selected, onSelect,
}: {
  picks: Record<string, (p: React.SVGProps<SVGSVGElement>) => JSX.Element>;
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  const entries = Object.entries(picks);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 border-y border-border">
      {entries.map(([key, Picto], i) => {
        const isSelected = selected === key;
        const row = Math.floor(i / 4);
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
            className={`relative p-4 flex items-center justify-center border-border transition-colors ${
              (i + 1) % 4 !== 0 ? 'border-r' : ''
            } ${row > 0 ? 'border-t' : ''} ${
              isSelected ? 'bg-foreground/5' : 'hover:bg-muted/40'
            }`}
          >
            <Picto width={64} height={64} />
            {isSelected && (
              <span
                aria-hidden
                className="absolute inset-0 border-2 border-foreground pointer-events-none"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function NumberPicker({
  label, options, value, onSelect,
}: {
  label: string; options: readonly number[]; value: number | null; onSelect: (n: number) => void;
}) {
  return (
    <FlatField label={label}>
      <div className="flex flex-wrap gap-2">
        {options.map((n) => (
          <Button
            key={n}
            variant={value === n ? 'default' : 'outline'}
            onClick={() => onSelect(n)}
            size="sm"
            className="rounded-element"
          >
            {n}
          </Button>
        ))}
      </div>
    </FlatField>
  );
}

function ChipPicker({
  options, selected, onToggle, single,
}: {
  options: readonly string[]; selected: string[]; onToggle: (v: string) => void; single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Button
            key={o}
            variant={on ? 'default' : 'outline'}
            size="sm"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className="rounded-element"
          >
            {o.replace(/_/g, ' ')}
          </Button>
        );
      })}
      {single && <span className="sr-only">Select one</span>}
    </div>
  );
}
