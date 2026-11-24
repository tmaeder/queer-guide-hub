import type { ComponentType, ReactElement, SVGProps } from 'react';
import { Input } from '@/components/ui/input';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { Textarea } from '@/components/ui/textarea';
import { FlatField } from '@/components/ui/FlatFieldGroup';
import { Slider } from '@/components/ui/slider';
import { HankyCodePicker } from '@/components/intimate/HankyCodePicker';
import {
  AGE_BANDS,
  BODY_TYPES,
  GENITALIA_OPTIONS,
  ROLES,
  SAFER_SEX_PREFS,
  SIZE_CM_OPTIONS,
} from '@/assets/intimate/options';
import {
  angleOptions,
  bodyPictograms,
  getGenitalPictogramSet,
  intersexPictograms,
  penisPictograms,
  vaginaPictograms,
} from '@/assets/intimate/pictograms';
import {
  Activity,
  ArrowDown,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  BadgeCheck,
  Circle,
  CircleDashed,
  Crown,
  Drama,
  Droplets,
  Dumbbell,
  EyeOff,
  Flame,
  Flower2,
  Hand,
  HandHeart,
  Heart,
  HeartHandshake,
  Laugh,
  Link,
  MapPin,
  PawPrint,
  Pill,
  Repeat,
  Shield,
  ShieldCheck,
  Shirt,
  Smile,
  Sparkles,
  Sun,
  TestTube,
  Timer,
  User,
  UserRound,
  Users,
  Waves,
  Zap,
} from '@/components/icons';
import type { Genitalia, IntimateProfile, IntimateSeeking, WizardStep } from '@/lib/intimate/types';

type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;

const BODY_ICONS: Partial<Record<string, IconType>> = {
  slim: User,
  average: UserRound,
  athletic: Activity,
  muscular: Dumbbell,
  bear: PawPrint,
  chub: Smile,
  twink: Sparkles,
  otter: Waves,
};
const ROLE_ICONS: Partial<Record<string, IconType>> = {
  top: ArrowUp,
  bottom: ArrowDown,
  vers: ArrowUpDown,
  'vers-top': ArrowUpRight,
  'vers-bottom': ArrowDownRight,
  side: ArrowLeftRight,
  switch: Repeat,
  dom: Crown,
  sub: Hand,
};
const KINK_ICONS: Partial<Record<string, IconType>> = {
  oral: Smile,
  anal: Circle,
  kissing: Heart,
  fisting: Hand,
  rimming: CircleDashed,
  toys: Sparkles,
  roleplay: Drama,
  public: MapPin,
  group: Users,
  cuddling: HeartHandshake,
  massage: HandHeart,
  sensual: Flower2,
  rough: Zap,
  bondage: Link,
  spanking: Flame,
  leather: Shirt,
  rubber: Droplets,
  edging: Timer,
  tantra: Sun,
  tickling: Laugh,
};
const SAFER_ICONS: Partial<Record<string, IconType>> = {
  condoms_always: ShieldCheck,
  condoms_sometimes: Shield,
  prep: Pill,
  doxypep: Pill,
  undetectable: BadgeCheck,
  tested_recently: TestTube,
};
const GENITALIA_ICONS: Partial<Record<string, ReactElement>> = {
  penis: penisPictograms['penis-1']({ width: 16, height: 16 }),
  vagina: vaginaPictograms['vagina-1']({ width: 16, height: 16 }),
  intersex: intersexPictograms['intersex-1']({ width: 16, height: 16 }),
  prefer_not_to_say: <EyeOff size={14} aria-hidden="true" />,
};

export type IntimateDraft = Partial<IntimateProfile>;

export interface IntimateStepFieldsProps {
  step: WizardStep;
  merged: IntimateDraft;
  update: (patch: IntimateDraft) => void;
  kinkVocab: readonly string[];
  aboutText: string;
  setAboutText: (v: string) => void;
  lookingText: string;
  setLookingText: (v: string) => void;
  /** Which textareas the `text` step renders. Settings splits them across sections. */
  textParts?: 'both' | 'about' | 'looking';
}

/** The editable fields of one intimate-profile step. Shared by the onboarding
 *  wizard (one step at a time) and the settings page (all steps at once). */
export function IntimateStepFields({
  step,
  merged,
  update,
  kinkVocab,
  aboutText,
  setAboutText,
  lookingText,
  setLookingText,
  textParts = 'both',
}: IntimateStepFieldsProps) {
  const ageIndex = Math.max(
    0,
    AGE_BANDS.indexOf((merged.age_band ?? '') as (typeof AGE_BANDS)[number]),
  );
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
                icon={GENITALIA_ICONS[o.value]}
              >
                {o.label}
              </ToggleChip>
            ))}
          </div>
        </FlatField>
      )}

      {step === 'seeking' && (
        <SeekingFields
          seeking={merged.dating_prefs?.seeking ?? {}}
          onChange={(seeking) =>
            update({ dating_prefs: { ...(merged.dating_prefs ?? {}), seeking } })
          }
        />
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
          icons={BODY_ICONS}
          selected={merged.body_type ? [merged.body_type] : []}
          onToggle={(v) => update({ body_type: v })}
          single
        />
      )}

      {step === 'age' && (
        <div className="flex max-w-md flex-col gap-2">
          <span className="text-sm font-bold tabular-nums" aria-live="polite">
            {merged.age_band ?? 'Not set'}
          </span>
          <Slider
            min={0}
            max={AGE_BANDS.length - 1}
            step={1}
            value={[ageIndex]}
            onValueChange={([i]) => update({ age_band: AGE_BANDS[i] })}
            aria-label="Age band"
            aria-valuetext={merged.age_band ?? 'Not set'}
          />
          <div className="flex justify-between text-2xs text-muted-foreground">
            <span>{AGE_BANDS[0]}</span>
            <span>{AGE_BANDS[AGE_BANDS.length - 1]}</span>
          </div>
        </div>
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
          icons={ROLE_ICONS}
          selected={merged.role ?? []}
          onToggle={(v) => update({ role: toggleIn(merged.role ?? [], v) })}
        />
      )}

      {step === 'into' && (
        <ChipPicker
          options={kinkVocab}
          icons={KINK_ICONS}
          selected={merged.into_tags ?? []}
          onToggle={(v) => update({ into_tags: toggleIn(merged.into_tags ?? [], v) })}
        />
      )}

      {step === 'safer-sex' && (
        <ChipPicker
          options={SAFER_SEX_PREFS as readonly string[]}
          icons={SAFER_ICONS}
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
          {textParts !== 'looking' && (
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
          )}
          {textParts !== 'about' && (
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
          )}
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
    <div className="grid grid-cols-4 gap-1.5 rounded-element bg-surface-container p-1.5 sm:grid-cols-8">
      {entries.map(([key, Picto]) => {
        const isSelected = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
            className={`relative flex items-center justify-center rounded-element p-1.5 transition-colors ${
              isSelected ? 'bg-foreground text-background' : 'hover:bg-muted'
            }`}
          >
            <Picto width={44} height={44} />
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
  icons,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
  single?: boolean;
  icons?: Partial<Record<string, IconType>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        const Icon = icons?.[o];
        return (
          <ToggleChip
            key={o}
            pressed={on}
            onPressedChange={() => onToggle(o)}
            icon={Icon ? <Icon size={14} aria-hidden="true" /> : undefined}
          >
            {o.replace(/_/g, ' ')}
          </ToggleChip>
        );
      })}
      {single && <span className="sr-only">Select one</span>}
    </div>
  );
}

function SeekingFields({
  seeking,
  onChange,
}: {
  seeking: IntimateSeeking;
  onChange: (next: IntimateSeeking) => void;
}) {
  const bands = AGE_BANDS as readonly string[];
  const lo = Math.max(0, bands.indexOf(seeking.age_min ?? bands[0]));
  const hi = Math.max(lo, bands.indexOf(seeking.age_max ?? bands[bands.length - 1]));
  const anyAge = !seeking.age_min && !seeking.age_max;
  const set = (patch: IntimateSeeking) => onChange({ ...seeking, ...patch });
  const toggle = (key: 'genitalia' | 'roles' | 'body_types', v: string) =>
    set({ [key]: toggleIn(seeking[key] ?? [], v) });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-13 text-muted-foreground">Genitals</span>
        <div className="flex flex-wrap gap-1.5">
          {GENITALIA_OPTIONS.filter((o) => o.value !== 'prefer_not_to_say').map((o) => (
            <ToggleChip
              key={o.value}
              pressed={(seeking.genitalia ?? []).includes(o.value)}
              onPressedChange={() => toggle('genitalia', o.value)}
              icon={GENITALIA_ICONS[o.value]}
            >
              {o.label}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div className="flex max-w-md flex-col gap-2">
        <span className="text-13 text-muted-foreground">
          Age:{' '}
          <span className="font-bold text-foreground tabular-nums" aria-live="polite">
            {anyAge ? 'Any' : `${bands[lo]} to ${bands[hi]}`}
          </span>
        </span>
        <Slider
          min={0}
          max={bands.length - 1}
          step={1}
          minStepsBetweenThumbs={0}
          value={[lo, hi]}
          onValueChange={([a, b]) => set({ age_min: bands[a], age_max: bands[b] })}
          aria-label="Age range"
        />
        <div className="flex justify-between text-2xs text-muted-foreground">
          <span>{bands[0]}</span>
          <span>{bands[bands.length - 1]}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-13 text-muted-foreground">Hanky code</span>
        <HankyCodePicker
          value={seeking.hanky ?? {}}
          onChange={(variantId, side) => {
            const next = { ...(seeking.hanky ?? {}) };
            if (side) next[variantId] = side;
            else delete next[variantId];
            set({ hanky: next });
          }}
          help="Pick the kinks you want, and the pocket the other person wears them in: left for someone who gives or tops, right for someone who receives or bottoms."
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-13 text-muted-foreground">Body types</span>
        <ChipPicker
          options={BODY_TYPES as readonly string[]}
          icons={BODY_ICONS}
          selected={seeking.body_types ?? []}
          onToggle={(v) => toggle('body_types', v)}
        />
      </div>
      <p className="text-xs text-muted-foreground">Leave a group empty to mean anyone.</p>
    </div>
  );
}
