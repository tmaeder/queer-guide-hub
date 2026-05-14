import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  AGE_BANDS, BODY_TYPES, GENITALIA_OPTIONS, INTO_TAGS as FALLBACK_INTO, LIMITS as FALLBACK_LIMITS, ROLES, SAFER_SEX_PREFS, SIZE_CM_OPTIONS,
} from '@/assets/intimate/options';
import {
  angleOptions, bodyPictograms, getGenitalPictogramSet,
} from '@/assets/intimate/pictograms';
import type { Genitalia, IntimateProfile, WizardStep } from '@/lib/intimate/types';

const STEP_ORDER: WizardStep[] = [
  'consent','genitalia','genital-pictogram','size','angle','body-pictogram','body-type',
  'age','height','role','into','limits','safer-sex','text','review',
];

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

  if (isLoading) return <div className="p-8">Loading…</div>;
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

  const next = () => {
    const visibleIdx = visibleSteps.indexOf(step);
    if (visibleIdx < visibleSteps.length - 1) {
      const nextStep = visibleSteps[visibleIdx + 1];
      setStepIdx(STEP_ORDER.indexOf(nextStep));
    }
  };
  const back = () => {
    const visibleIdx = visibleSteps.indexOf(step);
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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-2xl">Intimate profile</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Step {visibleSteps.indexOf(step) + 1} of {visibleSteps.length}
      </p>

      <Card>
        <CardContent className="p-6">
          {step === 'consent' && (
            <div className="space-y-4">
              <p>
                This section contains explicit sexual content. Your intimate profile is invisible
                to other users until you complete it, and is only ever visible to other users
                who have also opted in.
              </p>
              <div className="flex items-start gap-2">
                <Checkbox id="intimate-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                <Label htmlFor="intimate-consent" className="text-sm">
                  I confirm I am at least 18 years old and consent to seeing explicit content.
                </Label>
              </div>
            </div>
          )}

          {step === 'genitalia' && (
            <div className="space-y-2">
              <p className="mb-3">Which do you have?</p>
              {GENITALIA_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  variant={merged.genitalia === o.value ? 'default' : 'outline'}
                  onClick={() => update({ genitalia: o.value as Genitalia })}
                  className="mr-2"
                >{o.label}</Button>
              ))}
            </div>
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
            <div className="grid grid-cols-4 gap-3">
              {angleOptions.map(({ key, label, deg, Picto }) => {
                const selected = merged.erection_angle_deg === deg;
                return (
                  <button
                    key={key}
                    onClick={() => update({ erection_angle_deg: deg })}
                    className={`border p-3 ${selected ? 'border-foreground' : 'border-border'}`}
                    aria-label={`Angle ${label}`}
                  >
                    <Picto width={56} height={56} />
                    <div className="mt-1 text-xs">{label}</div>
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
            <div>
              <Label htmlFor="h">Height (cm)</Label>
              <Input
                id="h" type="number" min={100} max={250}
                value={merged.height_cm ?? ''}
                onChange={(e) => update({ height_cm: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          )}

          {step === 'role' && (
            <ChipPicker
              options={ROLES as readonly string[]}
              selected={merged.role ?? []}
              onToggle={(v) => update({
                role: toggleIn(merged.role ?? [], v),
              })}
            />
          )}
          {step === 'into' && (
            <ChipPicker
              options={kinkVocab}
              selected={merged.into_tags ?? []}
              onToggle={(v) => update({
                into_tags: toggleIn(merged.into_tags ?? [], v),
              })}
            />
          )}
          {step === 'limits' && (
            <ChipPicker
              options={kinkTags?.length ? kinkVocab : (FALLBACK_LIMITS as readonly string[])}
              selected={merged.limits ?? []}
              onToggle={(v) => update({
                limits: toggleIn(merged.limits ?? [], v),
              })}
            />
          )}
          {step === 'safer-sex' && (
            <ChipPicker
              options={SAFER_SEX_PREFS as readonly string[]}
              selected={merged.safer_sex_prefs ?? []}
              onToggle={(v) => update({
                safer_sex_prefs: toggleIn(merged.safer_sex_prefs ?? [], v),
              })}
            />
          )}

          {step === 'text' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="about">About me (optional)</Label>
                <Textarea
                  id="about"
                  maxLength={1000}
                  placeholder="A few lines about you."
                  value={aboutText}
                  onChange={(e) => setAboutText(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="looking">Looking for (optional)</Label>
                <Textarea
                  id="looking"
                  maxLength={500}
                  placeholder="What are you into right now?"
                  value={lookingText}
                  onChange={(e) => setLookingText(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Free text fields are encrypted at rest and scanned by automated moderation.
              </p>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-2 text-sm">
              <p>You&apos;re ready. Activating will make your profile visible to other opted-in users.</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {merged.genitalia && <li>Genitalia: {merged.genitalia}</li>}
                {merged.size_cm && <li>Size: {merged.size_cm} cm</li>}
                {merged.erection_angle_deg !== undefined && merged.erection_angle_deg !== null && <li>Angle: {merged.erection_angle_deg}°</li>}
                {merged.body_type && <li>Body: {merged.body_type}</li>}
                {merged.age_band && <li>Age: {merged.age_band}</li>}
                {merged.height_cm && <li>Height: {merged.height_cm} cm</li>}
                {merged.role?.length ? <li>Role: {merged.role.join(', ')}</li> : null}
              </ul>
            </div>
          )}

          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={back} disabled={visibleSteps.indexOf(step) === 0}>Back</Button>
            {step === 'review' ? (
              <Button onClick={submit} disabled={upsert.isPending}>
                {upsert.isPending ? 'Activating…' : 'Activate'}
              </Button>
            ) : (
              <Button
                onClick={next}
                disabled={step === 'consent' && !consent}
              >Next</Button>
            )}
          </div>
        </CardContent>
      </Card>
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
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {Object.entries(picks).map(([key, Picto]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          aria-pressed={selected === key}
          className={`border p-3 ${selected === key ? 'border-foreground' : 'border-border'}`}
        >
          <Picto width={64} height={64} />
        </button>
      ))}
    </div>
  );
}

function NumberPicker({
  label, options, value, onSelect,
}: {
  label: string; options: readonly number[]; value: number | null; onSelect: (n: number) => void;
}) {
  return (
    <div>
      <p className="mb-3">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((n) => (
          <Button
            key={n}
            variant={value === n ? 'default' : 'outline'}
            onClick={() => onSelect(n)}
            size="sm"
          >{n}</Button>
        ))}
      </div>
    </div>
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
          >
            {o.replace(/_/g, ' ')}
          </Button>
        );
      })}
      {single && <span className="sr-only">Select one</span>}
    </div>
  );
}
