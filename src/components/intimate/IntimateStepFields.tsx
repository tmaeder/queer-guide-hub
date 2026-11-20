import type { ReactElement, SVGProps } from 'react';
import { Input } from '@/components/ui/input';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { Textarea } from '@/components/ui/textarea';
import { FlatField } from '@/components/ui/FlatFieldGroup';
import {
  AGE_BANDS,
  BODY_TYPES,
  GENITALIA_OPTIONS,
  ROLES,
  SAFER_SEX_PREFS,
  SIZE_CM_OPTIONS,
} from '@/assets/intimate/options';
import { angleOptions, bodyPictograms, getGenitalPictogramSet } from '@/assets/intimate/pictograms';
import type { Genitalia, IntimateProfile, WizardStep } from '@/lib/intimate/types';

export type IntimateDraft = Partial<IntimateProfile>;

export interface IntimateStepFieldsProps {
  step: WizardStep;
  merged: IntimateDraft;
  update: (patch: IntimateDraft) => void;
  kinkVocab: readonly string[];
  limitsVocab: readonly string[];
  aboutText: string;
  setAboutText: (v: string) => void;
  lookingText: string;
  setLookingText: (v: string) => void;
}

/** The editable fields of one intimate-profile step. Shared by the onboarding
 *  wizard (one step at a time) and the settings page (all steps at once). */
export function IntimateStepFields({
  step,
  merged,
  update,
  kinkVocab,
  limitsVocab,
  aboutText,
  setAboutText,
  lookingText,
  setLookingText,
}: IntimateStepFieldsProps) {
  return (
    <>
      {step === 'genitalia' && (
        <FlatField>
          <div className="flex flex-wrap gap-1.5">
            {GENITALIA_OPTIONS.map((o) => (
              <ToggleChip
                key={o.value}
                pressed={merged.genitalia === o.value}
                onPressedChange={() => update({ genitalia: o.value as Genitalia })}
              >
                {o.label}
              </ToggleChip>
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
        <div className="grid grid-cols-2 gap-2 bg-surface-container p-2 sm:grid-cols-4">
          {angleOptions.map(({ key, label, deg, Picto }) => {
            const selected = merged.erection_angle_deg === deg;
            return (
              <button
                key={key}
                type="button"
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
            onChange={(e) => update({ height_cm: e.target.value ? Number(e.target.value) : null })}
            className="rounded-element max-w-xs"
          />
        </FlatField>
      )}

      {step === 'role' && (
        <ChipPicker
          options={ROLES as readonly string[]}
          selected={merged.role ?? []}
          onToggle={(v) => update({ role: toggleIn(merged.role ?? [], v) })}
        />
      )}

      {step === 'into' && (
        <ChipPicker
          options={kinkVocab}
          selected={merged.into_tags ?? []}
          onToggle={(v) => update({ into_tags: toggleIn(merged.into_tags ?? [], v) })}
        />
      )}

      {step === 'limits' && (
        <ChipPicker
          options={limitsVocab}
          selected={merged.limits ?? []}
          onToggle={(v) => update({ limits: toggleIn(merged.limits ?? [], v) })}
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
    </>
  );
}

function toggleIn(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function PictogramGrid({
  picks,
  selected,
  onSelect,
}: {
  picks: Record<string, (p: SVGProps<SVGSVGElement>) => ReactElement>;
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  const entries = Object.entries(picks);
  return (
    <div className="grid grid-cols-3 gap-2 bg-surface-container p-2 sm:grid-cols-4">
      {entries.map(([key, Picto]) => {
        const isSelected = selected === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
            className={`relative flex items-center justify-center p-4 transition-colors ${
              isSelected ? 'bg-background' : 'hover:bg-muted/40'
            }`}
          >
            <Picto width={64} height={64} />
          </button>
        );
      })}
    </div>
  );
}

function NumberPicker({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: readonly number[];
  value: number | null;
  onSelect: (n: number) => void;
}) {
  return (
    <FlatField label={label}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((n) => (
          <ToggleChip key={n} pressed={value === n} onPressedChange={() => onSelect(n)}>
            {n}
          </ToggleChip>
        ))}
      </div>
    </FlatField>
  );
}

function ChipPicker({
  options,
  selected,
  onToggle,
  single,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <ToggleChip key={o} pressed={on} onPressedChange={() => onToggle(o)}>
            {o.replace(/_/g, ' ')}
          </ToggleChip>
        );
      })}
      {single && <span className="sr-only">Select one</span>}
    </div>
  );
}
