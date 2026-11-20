import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { IntimateStepFields } from '@/components/intimate/IntimateStepFields';

const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const;
const noop = () => {};

function Heading({ children }: { children: string }) {
  return (
    <h3 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{children}</h3>
  );
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
  const num = (v: string) => (v === '' ? null : Number(v));
  const dirty = Object.keys(draft).length > 0;
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
      <section aria-label="Body" className="flex flex-col gap-2">
        <Heading>Body</Heading>
        <IntimateStepFields
          step="body-pictogram"
          merged={merged}
          update={set}
          kinkVocab={[]}
          limitsVocab={[]}
          aboutText=""
          setAboutText={noop}
          lookingText=""
          setLookingText={noop}
        />
      </section>
      <section aria-label="Body type" className="flex flex-col gap-2">
        <Heading>Body type</Heading>
        <IntimateStepFields
          step="body-type"
          merged={merged}
          update={set}
          kinkVocab={[]}
          limitsVocab={[]}
          aboutText=""
          setAboutText={noop}
          lookingText=""
          setLookingText={noop}
        />
      </section>

      <section aria-label="Height and weight" className="flex flex-wrap gap-4">
        <FlatField label="Height (cm)" htmlFor="body-height">
          <Input
            id="body-height"
            type="number"
            min={100}
            max={250}
            value={merged.height_cm ?? ''}
            onChange={(e) => set({ height_cm: num(e.target.value) })}
            className="w-32 rounded-element"
          />
        </FlatField>
        <FlatField label="Weight (kg)" htmlFor="body-weight">
          <Input
            id="body-weight"
            type="number"
            min={30}
            max={300}
            step={0.5}
            value={merged.weight_kg ?? ''}
            onChange={(e) => set({ weight_kg: num(e.target.value) })}
            className="w-32 rounded-element"
          />
        </FlatField>
      </section>

      <section aria-label="Clothing sizes" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Heading>Clothing sizes</Heading>
          <p className="text-xs text-muted-foreground">
            Used to filter shop listings to your size.
          </p>
        </div>
        <FlatField label="Tops & shirts">
          <SizeChips value={merged.size_top} onChange={(v) => set({ size_top: v })} />
        </FlatField>
        <FlatField label="Underwear">
          <SizeChips value={merged.size_underwear} onChange={(v) => set({ size_underwear: v })} />
        </FlatField>
        <div className="flex flex-wrap gap-4">
          <FlatField label="Trousers" htmlFor="body-bottom">
            <Input
              id="body-bottom"
              maxLength={12}
              placeholder="32/32 or EU 48"
              value={merged.size_bottom ?? ''}
              onChange={(e) => set({ size_bottom: e.target.value || null })}
              className="w-40 rounded-element"
            />
          </FlatField>
          <FlatField label="Shoes" htmlFor="body-shoe">
            <Input
              id="body-shoe"
              maxLength={12}
              placeholder="EU 43"
              value={merged.size_shoe ?? ''}
              onChange={(e) => set({ size_shoe: e.target.value || null })}
              className="w-40 rounded-element"
            />
          </FlatField>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Switch
          id="body-visibility"
          checked={merged.visibility === 'members'}
          onCheckedChange={(on) => set({ visibility: on ? 'members' : 'private' })}
        />
        <Label htmlFor="body-visibility">Show on my profile to signed-in members</Label>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button onClick={onSave} disabled={!dirty || busy} className="rounded-element">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
