import { Suspense, useEffect, useRef, useState } from 'react';
import { lazyRetry } from '@/utils/lazyRetry';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  useIntimateKinkTags,
  useMyIntimateProfile,
  useMyIntimateText,
  useOptOutIntimateProfile,
  useSetIntimateText,
  useUpsertIntimateProfile,
} from '@/hooks/useIntimateProfile';
import { FlatFieldGroup } from '@/components/ui/FlatFieldGroup';
import { Skeleton } from '@/components/ui/skeleton';
import { HankyCodePicker } from '@/components/intimate/HankyCodePicker';
import {
  roleFromHanky,
  useHankyVariants,
  useMyHankySignals,
  type HankySide,
} from '@/hooks/useHankySignals';
import { useMyKinkRatings } from '@/hooks/useKinkRatings';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { HANKY_CODE } from '@/lib/flags/hankyCode';
import { hankyChecks } from '@/lib/intimate/hankyChecks';
import { IntimateStepFields, type IntimateDraft } from '@/components/intimate/IntimateStepFields';
import { INTO_TAGS as FALLBACK_INTO } from '@/assets/intimate/options';
import { getGenitalPictogramSet } from '@/assets/intimate/pictograms';
import type { WizardStep } from '@/lib/intimate/types';
import { ageBandFromDob } from '@/lib/intimate/ageBand';

/** Mismatches between your hanky, what you look for and your checklist. Hints only. */
function HankyHints({
  wanted,
  onFix,
}: {
  wanted: Record<string, HankySide>;
  onFix: (variantId: string, side: HankySide) => void;
}) {
  const { data: variants } = useHankyVariants();
  const { data: signals } = useMyHankySignals();
  const { data: ratings } = useMyKinkRatings();
  const { data: taxonomy } = useKinkTaxonomy();
  const colorOf = new Map((variants ?? []).map((v) => [v.variantId, v.colorId]));
  const worn: Record<string, HankySide> = {};
  for (const [variantId, side] of Object.entries(signals ?? {})) {
    const color = colorOf.get(variantId);
    if (color) worn[color] = side;
  }
  // Seeking is keyed by variant id, like the signals.
  const wantedByColor: Record<string, HankySide> = {};
  for (const [variantId, side] of Object.entries(wanted)) {
    const color = colorOf.get(variantId);
    if (color) wantedByColor[color] = side;
  }
  const variantOf = new Map((variants ?? []).map((v) => [v.colorId, v.variantId]));
  const items = new Map((taxonomy?.items ?? []).map((i) => [i.slug, i]));
  const checks = hankyChecks({
    worn,
    wanted: wantedByColor,
    label: (c) => {
      const e = HANKY_CODE.find((h) => h.id === c);
      return e ? `${e.colorEn} (${e.meaningEn})` : c;
    },
    itemLabel: (slug) => items.get(slug)?.label ?? slug,
    rating: (slug, side) => {
      const item = items.get(slug);
      return item ? ratings?.get(`${item.id}:${side}`)?.rating : undefined;
    },
  });
  if (!checks.length) return null;
  return (
    <section aria-label="Worth a second look" className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">Worth a second look</h4>
      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li
            key={`${c.kind}:${c.colorId}`}
            className="flex flex-wrap items-center gap-2 rounded-element bg-muted p-2 text-sm"
          >
            <span className="flex-1">{c.message}</span>
            {c.fixSide && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-element"
                onClick={() => onFix(variantOf.get(c.colorId) ?? c.colorId, c.fixSide!)}
              >
                Look for {c.fixSide} instead
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const KinkGridEditor = lazyRetry(() =>
  import('@/components/kinks/KinkGridEditor').then((m) => ({ default: m.KinkGridEditor })),
);

const SECTIONS: { step: WizardStep; label: string }[] = [
  { step: 'genitalia', label: 'Genitalia' },
  { step: 'genital-pictogram', label: 'Anatomy' },
  { step: 'size', label: 'Size' },
  { step: 'angle', label: 'Angle' },
  { step: 'age', label: 'Your age' },
  { step: 'safer-sex', label: 'Your safer sex' },
  { step: 'seeking', label: 'Who you are looking for' },
  { step: 'text', label: 'About and looking for' },
];

/**
 * Anatomy, hanky, kinks, text and visibility: the one editor for the 18+ profile
 * (/settings/dating). Build, height and weight live in Body & about
 * (`BodyProfileEditor`, synced back here). Kinks and hard limits live in the kink
 * grid only; the old `into`/`limits` arrays are no longer edited anywhere.
 */
/** `dateOfBirth`: the profile's, when known. The age band is then derived from it
 *  instead of being asked a second time. */
export function IntimateTab({ dateOfBirth }: { dateOfBirth?: string | null } = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me, isLoading } = useMyIntimateProfile();
  const { data: existingText } = useMyIntimateText();
  const { data: kinkTags } = useIntimateKinkTags();
  const upsert = useUpsertIntimateProfile();
  const setText = useSetIntimateText();
  const optOut = useOptOutIntimateProfile();

  const [draft, setDraft] = useState<IntimateDraft>({});

  // Age is set once, as the date of birth. Keep the intimate band in step with
  // it; the ref stops a failed save from retrying on every render.
  const derivedBand = ageBandFromDob(dateOfBirth);
  const syncedBand = useRef<string | null>(null);
  useEffect(() => {
    if (!derivedBand || !me?.consent_18plus_at || me.age_band === derivedBand) return;
    if (syncedBand.current === derivedBand) return;
    syncedBand.current = derivedBand;
    upsert.mutate({ age_band: derivedBand });
  }, [derivedBand, me?.consent_18plus_at, me?.age_band, upsert]);
  const [aboutText, setAboutText] = useState('');
  const [lookingText, setLookingText] = useState('');
  const [textDirty, setTextDirty] = useState(false);

  // Seed the editable copy once per fetched value (render-time adjustment,
  // not an effect: React re-renders immediately with the seeded state).
  const [seededText, setSeededText] = useState<typeof existingText>(undefined);
  if (existingText && existingText !== seededText) {
    setSeededText(existingText);
    setAboutText(existingText.about_intimate ?? '');
    setLookingText(existingText.looking_for ?? '');
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-4" role="status" aria-label="Loading intimate profile">
        <span className="sr-only">Loading intimate profile</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full rounded-element" />
      </div>
    );
  }

  // No profile, or one started without the 18+ consent: the wizard owns that gate.
  if (!me?.consent_18plus_at) {
    return (
      <FlatFieldGroup noTopBorder>
        <p className="text-sm leading-relaxed text-foreground">
          Enable an explicit, pictogram-based profile to connect with other opted-in users for
          travel hookups, local cruising, kink, or a privacy-preserving alternative to photo-based
          apps.
        </p>
        <Button
          onClick={() => navigate('/meet/dating/onboarding')}
          className="self-start rounded-element"
        >
          Enable intimate profile
        </Button>
      </FlatFieldGroup>
    );
  }

  const visible = !!me.opted_in_at;
  const merged = { ...me, ...draft } as IntimateDraft;
  const hasPictograms = Object.keys(getGenitalPictogramSet(merged.genitalia ?? null)).length > 0;
  const sections = SECTIONS.filter(({ step }) => {
    if (step === 'size' || step === 'angle') return merged.genitalia === 'penis';
    if (step === 'genital-pictogram') return hasPictograms;
    return true;
  });
  const kinkVocab: readonly string[] = kinkTags?.length
    ? kinkTags.map((t) => t.slug)
    : (FALLBACK_INTO as readonly string[]);
  const dirty = Object.keys(draft).length > 0 || textDirty;
  const busy = upsert.isPending || setText.isPending || optOut.isPending;

  const save = async () => {
    try {
      if (Object.keys(draft).length) await upsert.mutateAsync(draft);
      if (textDirty)
        await setText.mutateAsync({
          aboutIntimate: aboutText.trim() || null,
          lookingFor: lookingText.trim() || null,
        });
      setDraft({});
      setTextDirty(false);
      toast({ title: 'Intimate profile saved' });
    } catch (e) {
      toast({ title: 'Could not save', description: String(e), variant: 'destructive' });
    }
  };

  const show = async () => {
    await upsert.mutateAsync({ opted_in_at: new Date().toISOString() });
    toast({ title: 'Intimate profile visible to opted-in users.' });
  };

  const hide = async () => {
    await optOut.mutateAsync({});
    toast({ title: 'Intimate profile hidden. Your data is preserved.' });
  };

  const remove = async () => {
    if (!window.confirm('Permanently delete your intimate profile? This cannot be undone.')) return;
    await optOut.mutateAsync({ hardDelete: true });
    setDraft({});
    toast({ title: 'Intimate profile deleted.' });
  };

  const field = ({ step, label }: { step: WizardStep; label: string }) =>
    step === 'age' && derivedBand ? (
      <section key={step} aria-label={label} className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">{label}</h4>
        <p className="text-sm">
          <span className="font-bold">{derivedBand}</span>{' '}
          <span className="text-muted-foreground">from your date of birth in Profile.</span>
        </p>
      </section>
    ) : (
      <section key={step} aria-label={label} className="flex flex-col gap-2">
        {step !== 'text' && <h4 className="text-sm font-medium">{label}</h4>}
        <IntimateStepFields
          step={step}
          merged={merged}
          update={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          kinkVocab={kinkVocab}
          aboutText={aboutText}
          setAboutText={(v) => {
            setAboutText(v);
            setTextDirty(true);
          }}
          lookingText={lookingText}
          setLookingText={(v) => {
            setLookingText(v);
            setTextDirty(true);
          }}
        />
        {step === 'age' && (
          <p className="text-xs text-muted-foreground">
            Add your date of birth in Profile and this fills itself in.
          </p>
        )}
      </section>
    );
  const group = (title: string, description: string, steps: readonly WizardStep[]) => {
    const inGroup = sections.filter((x) => steps.includes(x.step));
    if (!inGroup.length) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">{inGroup.map(field)}</CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {group('You', 'What you are, as shown to other opted-in members.', [
        'genitalia',
        'genital-pictogram',
        'size',
        'angle',
        'age',
        'safer-sex',
      ])}

      <Card>
        <CardHeader>
          <CardTitle>Your hanky code</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your pockets set your role: left is top, right is bottom, both is vers.
          </p>
        </CardHeader>
        <CardContent>
          <section aria-label="Hanky code">
            <HankyCodePicker
              onWornChange={(signals) => upsert.mutate({ role: roleFromHanky(signals) })}
            />
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What you're looking for</CardTitle>
          <p className="text-sm text-muted-foreground">What you want from others.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {sections.filter((x) => x.step === 'seeking' || x.step === 'text').map(field)}
          <HankyHints
            wanted={merged.dating_prefs?.seeking?.hanky ?? {}}
            onFix={(variantId, side) => {
              const prefs = merged.dating_prefs ?? {};
              const seeking = prefs.seeking ?? {};
              setDraft((d) => ({
                ...d,
                dating_prefs: {
                  ...prefs,
                  seeking: { ...seeking, hanky: { ...(seeking.hanky ?? {}), [variantId]: side } },
                },
              }));
            }}
          />
        </CardContent>
      </Card>

      {visible && (
        <Card>
          <CardHeader>
            <CardTitle>Interests & boundaries</CardTitle>
            <p className="text-sm text-muted-foreground">
              Private by default. Your no's and hard limits are never shown to anyone.
            </p>
          </CardHeader>
          <CardContent>
            <section aria-label="Interests & boundaries">
              <Suspense fallback={<div className="h-40 rounded-element bg-muted" />}>
                <KinkGridEditor />
              </Suspense>
            </section>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!dirty || busy} className="rounded-element">
          {upsert.isPending || setText.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="ghost"
          onClick={visible ? hide : show}
          disabled={busy}
          className="rounded-element"
        >
          {visible ? 'Hide (keep data)' : 'Show profile'}
        </Button>
        <Button
          variant="ghost"
          onClick={remove}
          disabled={busy}
          className="ml-auto rounded-element text-destructive"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
