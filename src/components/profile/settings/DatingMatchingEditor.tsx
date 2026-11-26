import { useId, useState, type ComponentType, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Accessibility,
  ChevronDown,
  Clock,
  Coffee,
  EyeOff,
  Flame,
  Hand,
  Heart,
  Home,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  Camera,
} from '@/components/icons';
import {
  useDatingMatchingSettings,
  useSaveDatingMatchingSettings,
} from '@/hooks/useDatingMatching';
import { useMyIntimateProfile, useUpsertIntimateProfile } from '@/hooks/useIntimateProfile';
import type { HankySide } from '@/hooks/useHankySignals';
import { HankyCodePicker } from '@/components/intimate/HankyCodePicker';
import { HankyHints } from '@/components/intimate/HankyHints';
import {
  CONNECTION_GOALS,
  CONNECTION_PRACTICES,
  MATCHING_FIELDS,
  matchingLabel,
  matchingSettingsError,
  type DatingMatchingSettings,
  type MatchingField,
  type PreferenceStrength,
} from '@/lib/intimate/matching';
import { cn } from '@/lib/utils';

type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;

/** Icons for the 'What I'm open to' chips. Values without one stay text-only. */
const CHOICE_ICONS: Partial<Record<string, IconType>> = {
  dates: Coffee,
  relationship: Heart,
  casual: Flame,
  queerplatonic: Sparkles,
  friendship: Users,
  chosen_family: Home,
  ask_before_touch: Hand,
  text_first: MessageCircle,
  slow_pace: Clock,
  step_free_meetup: Accessibility,
  quiet_meetup: Volume2,
  discreet_contact: EyeOff,
  no_public_photos: Camera,
};

const inputClass = 'w-full rounded-element border border-input bg-background p-2 text-sm';

/** Criteria grouped so the long list reads as four short topics. */
const GROUPS: { title: string; keys: MatchingField[]; extra?: 'basics' | 'intimacy' }[] = [
  { title: 'Basics', keys: ['genders', 'age_bands'], extra: 'basics' },
  { title: 'Relationships', keys: ['relationship_styles', 'relationship_statuses', 'goals'] },
  {
    title: 'Intimacy',
    keys: ['positions', 'dynamics', 'activities', 'protection', 'body_types', 'genitalia'],
    extra: 'intimacy',
  },
  { title: 'Communication & access', keys: ['practices'] },
];

const PRIVACY_TOGGLES: {
  key: keyof Pick<
    DatingMatchingSettings,
    | 'use_identity'
    | 'use_interests'
    | 'use_intimate'
    | 'use_checklist'
    | 'use_hanky'
    | 'use_culture'
  >;
  label: string;
}[] = [
  { key: 'use_identity', label: 'Gender, relationship answers and looking-for tags' },
  { key: 'use_interests', label: 'Hobbies and interests' },
  { key: 'use_intimate', label: 'Intimate roles, interests, boundaries and body answers' },
  { key: 'use_checklist', label: 'Interests & boundaries checklist' },
  { key: 'use_hanky', label: 'Active hanky signals, for chemistry' },
  { key: 'use_culture', label: 'Flags and My Lines, for a small shared-culture bonus' },
];

export function DatingMatchingEditor() {
  const { data, isLoading, error, refetch } = useDatingMatchingSettings();
  const save = useSaveDatingMatchingSettings();
  const { data: intimate } = useMyIntimateProfile();
  const upsertIntimate = useUpsertIntimateProfile();
  const [draft, setDraft] = useState<DatingMatchingSettings | null>(null);
  // Hanky colours someone must wear. Stored with the intimate profile
  // (dating_prefs.seeking.hanky), which the server applies as a must.
  const [hankyDraft, setHankyDraft] = useState<Record<string, HankySide> | null>(null);
  const [feedback, setFeedback] = useState('');
  const settings = draft ?? data;

  if (isLoading) return <p role="status">Loading matching preferences…</p>;
  if (error || !settings)
    return (
      <div role="alert">
        <p>Matching preferences could not be loaded.</p>
        <Button type="button" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );

  const savedHanky = (intimate?.dating_prefs?.seeking?.hanky ?? {}) as Record<string, HankySide>;
  const hanky = hankyDraft ?? savedHanky;
  // The hanky filter needs an 18+ intimate profile on both sides.
  const hankyAvailable = !!intimate?.consent_18plus_at;
  const setHanky = (variantId: string, side: HankySide | null) => {
    const next = { ...hanky };
    if (side) next[variantId] = side;
    else delete next[variantId];
    setHankyDraft(next);
    setFeedback('');
  };
  const dirty = draft !== null || hankyDraft !== null;
  const change = (patch: Partial<DatingMatchingSettings>) => {
    setDraft({ ...settings, ...patch });
    setFeedback('');
  };
  const ruleChange = (key: MatchingField, strength: PreferenceStrength, values: string[]) => {
    change({ rules: { ...settings.rules, [key]: { strength, values } } });
  };
  const submit = async () => {
    const validationError = matchingSettingsError(settings);
    if (validationError) {
      setFeedback(validationError);
      return;
    }
    try {
      if (draft) await save.mutateAsync(settings);
      if (hankyDraft) {
        // `seeking` now holds hanky only: genitals, age and body types live in
        // the rules above, so older keys are dropped rather than left unseen.
        await upsertIntimate.mutateAsync({
          dating_prefs: { ...(intimate?.dating_prefs ?? {}), seeking: { hanky: hankyDraft } },
        });
      }
      setDraft(null);
      setHankyDraft(null);
      setFeedback('Saved.');
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : 'Could not save matching preferences. Please try again.',
      );
    }
  };
  const invalid = !!matchingSettingsError(settings);

  return (
    <fieldset disabled={save.isPending || upsertIntimate.isPending} className="flex flex-col gap-6">
      <legend className="sr-only">Matching preferences</legend>

      {/* 1. On or off. */}
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-sans text-title font-bold">Dating discovery</h3>
            <p className="text-sm text-muted-foreground">
              {settings.dating_enabled
                ? 'You are shown to members who also opted in.'
                : 'You are hidden. Your preferences are kept.'}
            </p>
          </div>
          <Switch
            aria-label="Show me in dating discovery"
            checked={settings.dating_enabled}
            onCheckedChange={(dating_enabled) => change({ dating_enabled })}
            className="mt-1"
          />
        </div>

        {settings.adult_consent_at ? (
          <p className="inline-flex items-center gap-1.5 text-13 text-muted-foreground">
            <ShieldCheck size={14} aria-hidden /> You confirmed you are 18 or older.
          </p>
        ) : (
          <label className="flex items-start gap-2 rounded-element bg-muted p-4 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={false}
              onChange={(e) =>
                change({ adult_consent_at: e.target.checked ? new Date().toISOString() : null })
              }
            />
            <span>I am 18 or older and choose to use dating discovery</span>
          </label>
        )}

        <label className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="font-bold">
            Visible until <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <span className="flex items-center gap-2">
            <input
              className={cn(inputClass, 'sm:w-auto')}
              type="datetime-local"
              value={settings.active_until ? localDateTime(settings.active_until) : ''}
              onChange={(e) =>
                change({
                  active_until: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
            {settings.active_until && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => change({ active_until: null })}
              >
                Clear
              </Button>
            )}
          </span>
        </label>

        <p className="text-13 text-muted-foreground">
          Your profile visibility still applies: a private profile stays hidden, a friends-only
          profile is shown only to friends.
        </p>
      </Panel>

      {/* 2. What I offer. */}
      <Panel title="What I’m open to" description="Shown on your dating profile.">
        <Choices
          label="Connections I’m available for"
          options={CONNECTION_GOALS}
          selected={settings.connection_goals}
          onChange={(connection_goals) => change({ connection_goals })}
        />
        <Choices
          label="Practices I can offer"
          hint="Pick what you can respect. Disability, neurodivergence and coming-out answers are never used to guess these."
          options={CONNECTION_PRACTICES}
          selected={settings.offered_practices}
          onChange={(offered_practices) => change({ offered_practices })}
        />
      </Panel>

      {/* 3. Who I want to meet. */}
      <Panel
        title="Who I want to meet"
        description="Pick what you like and matching people are shown first. Switch on Must have to only see people who match; their musts apply to you too."
      >
        <div className="flex flex-col gap-2">
          {GROUPS.map((group, index) => {
            const active =
              group.keys.filter((k) => (settings.rules[k]?.strength ?? 'any') !== 'any').length +
              (group.extra === 'basics'
                ? Number(settings.distance_strength !== 'any') +
                  Number(settings.height_strength !== 'any')
                : 0) +
              (group.extra === 'intimacy' && Object.keys(hanky).length > 0 ? 1 : 0);
            return (
              <Collapsible
                key={group.title}
                defaultOpen={index === 0}
                className="rounded-element bg-muted"
              >
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 px-4 py-4 text-left">
                  <span className="text-15 font-bold">{group.title}</span>
                  <span className="flex items-center gap-2 text-13 text-muted-foreground">
                    {active > 0 ? `${active} set` : 'No preferences'}
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className="transition-transform group-data-[state=open]:rotate-180"
                    />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-2 px-2 pb-2">
                  {group.keys.map((key) => {
                    const field = MATCHING_FIELDS.find((f) => f.key === key)!;
                    const rule = settings.rules[key] ?? {
                      strength: 'any' as const,
                      values: [],
                    };
                    return (
                      <Criterion
                        key={key}
                        label={field.label}
                        active={rule.values.length > 0}
                        must={rule.strength === 'required'}
                        onMust={(must) =>
                          ruleChange(key, must ? 'required' : 'preferred', rule.values)
                        }
                      >
                        <Choices
                          label={`${field.label}: options`}
                          hideLabel
                          hint={
                            'all' in field && field.all
                              ? 'Every selected option must be met when it is a must.'
                              : 'Any selected option counts.'
                          }
                          options={field.options}
                          selected={rule.values}
                          onChange={(values) =>
                            ruleChange(key, keepStrength(values.length > 0, rule.strength), values)
                          }
                        />
                      </Criterion>
                    );
                  })}
                  {group.extra === 'intimacy' && hankyAvailable && (
                    <div className="flex flex-col gap-4 rounded-element bg-card p-4">
                      <div>
                        <p className="text-sm font-bold">Hanky code</p>
                        <p className="text-13 text-muted-foreground">
                          A must: people need to wear one of these. Left pocket for someone who
                          gives or tops, right for someone who receives or bottoms.
                        </p>
                      </div>
                      <HankyCodePicker value={hanky} onChange={setHanky} />
                      <HankyHints
                        wanted={hanky}
                        onFix={(variantId, side) => setHanky(variantId, side)}
                      />
                    </div>
                  )}
                  {group.extra === 'basics' && (
                    <>
                      <Criterion
                        label="Distance"
                        active={settings.max_distance_km != null}
                        must={settings.distance_strength === 'required'}
                        onMust={(must) =>
                          change({ distance_strength: must ? 'required' : 'preferred' })
                        }
                      >
                        <label className="flex items-center gap-2 text-sm">
                          Up to
                          <input
                            className={cn(inputClass, 'w-28')}
                            type="number"
                            min={1}
                            max={20000}
                            value={settings.max_distance_km ?? ''}
                            onChange={(e) => {
                              const max_distance_km = numberOrNull(e.target.value);
                              change({
                                max_distance_km,
                                distance_strength: keepStrength(
                                  max_distance_km != null,
                                  settings.distance_strength,
                                ),
                              });
                            }}
                          />
                          km
                        </label>
                        <p className="text-13 text-muted-foreground">
                          From your discovery, travel or home city, approximately. Exact GPS is
                          never used.
                        </p>
                      </Criterion>
                      <Criterion
                        label="Height"
                        active={settings.min_height_cm != null || settings.max_height_cm != null}
                        must={settings.height_strength === 'required'}
                        onMust={(must) =>
                          change({ height_strength: must ? 'required' : 'preferred' })
                        }
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <input
                            aria-label="Minimum height (cm)"
                            className={cn(inputClass, 'w-24')}
                            type="number"
                            min={50}
                            max={300}
                            value={settings.min_height_cm ?? ''}
                            onChange={(e) => {
                              const min_height_cm = numberOrNull(e.target.value);
                              change({
                                min_height_cm,
                                height_strength: keepStrength(
                                  min_height_cm != null || settings.max_height_cm != null,
                                  settings.height_strength,
                                ),
                              });
                            }}
                          />
                          to
                          <input
                            aria-label="Maximum height (cm)"
                            className={cn(inputClass, 'w-24')}
                            type="number"
                            min={50}
                            max={300}
                            value={settings.max_height_cm ?? ''}
                            onChange={(e) => {
                              const max_height_cm = numberOrNull(e.target.value);
                              change({
                                max_height_cm,
                                height_strength: keepStrength(
                                  max_height_cm != null || settings.min_height_cm != null,
                                  settings.height_strength,
                                ),
                              });
                            }}
                          />
                          cm
                        </div>
                      </Criterion>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
        <p className="text-13 text-muted-foreground">
          Orientation labels, pronouns and pride flags never imply attraction. Coming-out status and
          health information are never ranking signals. A match is never consent to an activity.
        </p>
      </Panel>

      {/* 4. What matching may read. */}
      <Panel
        title="What matching may use"
        description="Private: these answers sort your results but are never shown in match explanations. Shared chemistry needs both people to opt in."
      >
        <ul className="flex flex-col">
          {PRIVACY_TOGGLES.map(({ key, label }) => (
            <li key={key} className="border-t border-border first:border-t-0">
              <label className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm">
                {label}
                <Switch
                  checked={settings[key]}
                  onCheckedChange={(value) => change({ [key]: value })}
                  aria-label={label}
                />
              </label>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Save stays in reach on a long page, and only appears when there is
          something to save or to report. The right padding keeps the button
          clear of the floating + button. */}
      {(dirty || feedback) && (
        <div className="sticky bottom-24 z-10 flex flex-wrap items-center justify-between gap-4 rounded-container bg-card py-4 pl-6 pr-20 shadow-soft-lg md:bottom-4">
          <p
            role={feedback && (save.isError || invalid) ? 'alert' : 'status'}
            className="text-sm font-bold"
          >
            {feedback || 'Unsaved changes'}
          </p>
          {dirty && (
            <Button
              type="button"
              onClick={submit}
              disabled={save.isPending || upsertIntimate.isPending}
            >
              {save.isPending || upsertIntimate.isPending ? 'Saving…' : 'Save matching preferences'}
            </Button>
          )}
        </div>
      )}
    </fieldset>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-container bg-card p-6 shadow-soft"
    >
      {title && (
        <div className="flex flex-col gap-1">
          <h3 className="font-sans text-title font-bold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A choice ranks people higher; "Must have" turns it into a dealbreaker. */
function keepStrength(active: boolean, previous: PreferenceStrength): PreferenceStrength {
  if (!active) return 'any';
  return previous === 'required' ? 'required' : 'preferred';
}

/** One criterion: its options, and a Must have switch once something is picked. */
function Criterion({
  label,
  active,
  must,
  onMust,
  children,
}: {
  label: string;
  active: boolean;
  must: boolean;
  onMust: (must: boolean) => void;
  children: ReactNode;
}) {
  const mustId = useId();
  return (
    <fieldset className="flex flex-col gap-4 rounded-element bg-card p-4">
      <legend className="sr-only">{label}</legend>
      <p aria-hidden="true" className="text-sm font-bold">
        {label}
      </p>
      {children}
      {active && (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-sm">
          <label htmlFor={mustId} className="font-bold">
            Must have
            <span className="block text-13 font-normal text-muted-foreground">
              {must ? 'Only people who match are shown.' : 'People who match are shown first.'}
            </span>
          </label>
          <Switch
            id={mustId}
            checked={must}
            onCheckedChange={onMust}
            aria-label={`${label}: must have`}
          />
        </div>
      )}
    </fieldset>
  );
}

function numberOrNull(value: string) {
  return value === '' ? null : Number(value);
}
function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function Choices({
  label,
  hideLabel = false,
  hint,
  options,
  selected,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  options: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={cn('mb-2 text-sm font-bold', hideLabel && 'sr-only')}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((value) => {
          const Icon = CHOICE_ICONS[value];
          return (
            <Button
              type="button"
              key={value}
              size="sm"
              variant={selected.includes(value) ? 'default' : 'outline'}
              aria-pressed={selected.includes(value)}
              onClick={() =>
                onChange(
                  selected.includes(value)
                    ? selected.filter((v) => v !== value)
                    : [...selected, value],
                )
              }
            >
              {Icon && <Icon size={16} aria-hidden="true" />}
              {matchingLabel(value)}
            </Button>
          );
        })}
      </div>
      {hint && <p className="text-13 text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}
