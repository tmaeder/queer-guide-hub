import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { FlatField } from '@/components/ui/FlatFieldGroup';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useBodyProfile, useSaveBodyProfile, type BodyProfilePatch } from '@/hooks/useBodyProfile';
import { useMyIntimateProfile, useUpsertIntimateProfile } from '@/hooks/useIntimateProfile';
import { bodyChecks } from '@/lib/bodyChecks';
import { IntimateStepFields } from '@/components/intimate/IntimateStepFields';

const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const;
const noop = () => {};

function SubHeading({ children }: { children: string }) {
  return <h4 className="text-sm font-medium">{children}</h4>;
}

function SizeChips({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LETTER_SIZES.map((s) => (
        <ToggleChip
          key={s}
          pressed={value === s}
          onPressedChange={() => onChange(value === s ? null : s)}
        >
          {s}
        </ToggleChip>
      ))}
    </div>
  );
}

/**
 * Body & about: build, height, weight and clothing sizes. Private by default; members
 * can see it only when the owner turns visibility on. Build and height are mirrored
 * into the intimate profile when one exists, so they are edited in one place.
 */
export function BodyProfileEditor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: body, isLoading } = useBodyProfile(user?.id);
  const { data: intimate } = useMyIntimateProfile();
  const save = useSaveBodyProfile();
  const upsertIntimate = useUpsertIntimateProfile();
  const [draft, setDraft] = useState<BodyProfilePatch>({});

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-4" role="status" aria-label="Loading body profile">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full rounded-element" />
      </div>
    );
  }

  // Until a row exists, start from what the intimate profile already holds.
  const base: BodyProfilePatch = body ?? {
    body_pictogram_key: intimate?.body_pictogram_key ?? null,
    body_type: intimate?.body_type ?? null,
    height_cm: intimate?.height_cm ?? null,
    visibility: 'private',
  };
  const merged = { ...base, ...draft };
  const set = (patch: BodyProfilePatch) => setDraft((d) => ({ ...d, ...patch }));
  // Each figure pictures one body type (key `body-<type>`), so picking either
  // sets the other and the two can never disagree.
  const setBuild = (patch: BodyProfilePatch) => {
    if (patch.body_pictogram_key !== undefined) {
      const type = patch.body_pictogram_key?.replace(/^body-/, '') ?? null;
      set({ body_pictogram_key: patch.body_pictogram_key, body_type: type });
    } else if (patch.body_type !== undefined) {
      set({
        body_type: patch.body_type,
        body_pictogram_key: patch.body_type ? `body-${patch.body_type}` : null,
      });
    } else set(patch);
  };
  const num = (v: string) => (v === '' ? null : Number(v));
  const dirty = Object.keys(draft).length > 0;
  const checks = bodyChecks(merged);
  const blocked = checks.some((c) => c.level === 'error');
  const busy = save.isPending || upsertIntimate.isPending;

  const onSave = async () => {
    try {
      const { visibility, ...fields } = merged;
      await save.mutateAsync({ ...fields, visibility: visibility ?? 'private' });
      if (intimate?.consent_18plus_at) {
        await upsertIntimate.mutateAsync({
          body_pictogram_key: merged.body_pictogram_key ?? null,
          body_type: merged.body_type ?? null,
          height_cm: merged.height_cm ?? null,
        });
      }
      setDraft({});
      toast({ title: 'Body & about saved' });
    } catch (e) {
      toast({ title: 'Could not save', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Build</CardTitle>
          <p className="text-sm text-muted-foreground">Pick the figure and type closest to you.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section aria-label="Body" className="flex flex-col gap-2">
            <SubHeading>Figure</SubHeading>
            <IntimateStepFields
              step="body-pictogram"
              merged={merged}
              update={setBuild}
              kinkVocab={[]}
              aboutText=""
              setAboutText={noop}
              lookingText=""
              setLookingText={noop}
            />
          </section>
          <section aria-label="Body type" className="flex flex-col gap-2">
            <SubHeading>Body type</SubHeading>
            <IntimateStepFields
              step="body-type"
              merged={merged}
              update={setBuild}
              kinkVocab={[]}
              aboutText=""
              setAboutText={noop}
              lookingText=""
              setLookingText={noop}
            />
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Measurements</CardTitle>
        </CardHeader>
        <CardContent>
          <section aria-label="Height and weight" className="grid grid-cols-2 gap-4 sm:max-w-md">
            <FlatField label="Height (cm)" htmlFor="body-height">
              <Input
                id="body-height"
                type="number"
                inputMode="numeric"
                min={100}
                max={250}
                value={merged.height_cm ?? ''}
                onChange={(e) => set({ height_cm: num(e.target.value) })}
                className="rounded-element"
              />
            </FlatField>
            <FlatField label="Weight (kg)" htmlFor="body-weight">
              <Input
                id="body-weight"
                type="number"
                inputMode="decimal"
                min={30}
                max={300}
                step={0.5}
                value={merged.weight_kg ?? ''}
                onChange={(e) => set({ weight_kg: num(e.target.value) })}
                className="rounded-element"
              />
            </FlatField>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clothing sizes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Used to filter shop listings to your size.
          </p>
        </CardHeader>
        <CardContent>
          <section aria-label="Clothing sizes" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <SubHeading>Tops & shirts</SubHeading>
              <SizeChips value={merged.size_top} onChange={(v) => set({ size_top: v })} />
            </div>
            <div className="flex flex-col gap-2">
              <SubHeading>Underwear</SubHeading>
              <SizeChips
                value={merged.size_underwear}
                onChange={(v) => set({ size_underwear: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:max-w-md">
              <FlatField label="Trousers" htmlFor="body-bottom">
                <Input
                  id="body-bottom"
                  maxLength={12}
                  placeholder="32/32 or EU 48"
                  value={merged.size_bottom ?? ''}
                  onChange={(e) => set({ size_bottom: e.target.value || null })}
                  className="rounded-element"
                />
              </FlatField>
              <FlatField label="Shoes" htmlFor="body-shoe">
                <Input
                  id="body-shoe"
                  maxLength={12}
                  placeholder="EU 43"
                  value={merged.size_shoe ?? ''}
                  onChange={(e) => set({ size_shoe: e.target.value || null })}
                  className="rounded-element"
                />
              </FlatField>
            </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-6">
          <div className="flex flex-col gap-1">
            <Label htmlFor="body-visibility" className="text-base font-semibold">
              Show on my profile
            </Label>
            <p className="text-sm text-muted-foreground">
              Signed-in members only. Off keeps all of this private.
            </p>
          </div>
          <Switch
            id="body-visibility"
            checked={merged.visibility === 'members'}
            onCheckedChange={(on) => set({ visibility: on ? 'members' : 'private' })}
          />
        </CardContent>
      </Card>

      {checks.length > 0 && (
        <section
          aria-label="Worth a second look"
          className="flex flex-col gap-1.5 rounded-element bg-muted p-4"
          aria-live="polite"
        >
          <h3 className="text-sm font-semibold">
            {blocked ? 'Fix before saving' : 'Worth a second look'}
          </h3>
          <ul className="flex list-disc flex-col gap-1 ps-4 text-sm">
            {checks.map((c) => (
              <li
                key={c.field + c.message}
                className={c.level === 'error' ? 'text-destructive' : undefined}
              >
                {c.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={!dirty || busy || blocked} className="rounded-element">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
