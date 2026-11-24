import { useState } from 'react';
import { LocalizedLink as Link } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useDatingMatchingSettings,
  useSaveDatingMatchingSettings,
} from '@/hooks/useDatingMatching';
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

const inputClass = 'mt-2 w-full rounded-element border border-input bg-background p-2 text-sm';

export function DatingMatchingEditor() {
  const { data, isLoading, error, refetch } = useDatingMatchingSettings();
  const save = useSaveDatingMatchingSettings();
  const [draft, setDraft] = useState<DatingMatchingSettings | null>(null);
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
      await save.mutateAsync(settings);
      setDraft(null);
      setFeedback('Matching preferences saved. Your requirements stay strict.');
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : 'Could not save matching preferences. Please try again.',
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who I want to meet</CardTitle>
        <p className="text-sm text-muted-foreground">
          Both people’s requirements must be met. Saved “Who you are looking for” filters below
          remain requirements too. Preferred answers affect order. Missing required answers do not
          count as a match.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset disabled={save.isPending} className="space-y-6">
          <legend className="sr-only">Matching preferences</legend>
          <Toggle
            label="Show me in dating discovery"
            checked={settings.dating_enabled}
            onChange={(dating_enabled) => change({ dating_enabled })}
          />
          <Toggle
            label="I am 18 or older and choose to use dating discovery"
            checked={!!settings.adult_consent_at}
            onChange={(checked) =>
              change({
                adult_consent_at: checked ? new Date().toISOString() : null,
                ...(!checked ? { dating_enabled: false } : {}),
              })
            }
          />
          <p className="text-sm text-muted-foreground">
            Dating works without an intimate profile. Hide dating here whenever you want; this
            preserves your preferences.
          </p>
          <p className="text-sm text-muted-foreground">
            Your overall profile visibility still applies. A private profile stays hidden; a
            friends-only profile is shown only to accepted friends.
          </p>
          <label className="block text-sm font-bold">
            Appear until (optional)
            <input
              className={inputClass}
              type="datetime-local"
              value={settings.active_until ? localDateTime(settings.active_until) : ''}
              onChange={(e) =>
                change({
                  active_until: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </label>

          <Choices
            label="Connections I’m available for"
            options={CONNECTION_GOALS}
            selected={settings.connection_goals}
            onChange={(connection_goals) => change({ connection_goals })}
          />
          <Choices
            label="Practices I can offer"
            options={CONNECTION_PRACTICES}
            selected={settings.offered_practices}
            onChange={(offered_practices) => change({ offered_practices })}
          />
          <p className="text-sm text-muted-foreground">
            Choose practices you can respect. Disability, neurodivergence and coming-out answers are
            never used to infer these.
          </p>

          <fieldset className="space-y-4">
            <legend className="mb-4 font-bold">Use privately for matching</legend>
            <p className="text-sm text-muted-foreground">
              These permissions are separate from profile visibility. Private answers are not shown
              in match explanations. Shared chemistry and culture inputs require both people to opt
              in.
            </p>
            <Toggle
              label="Use my gender, relationship answers and looking-for tags"
              checked={settings.use_identity}
              onChange={(use_identity) => change({ use_identity })}
            />
            <Toggle
              label="Use my hobbies and interests"
              checked={settings.use_interests}
              onChange={(use_interests) => change({ use_interests })}
            />
            <Toggle
              label="Use my intimate roles, interests, boundaries and body answers"
              checked={settings.use_intimate}
              onChange={(use_intimate) => change({ use_intimate })}
            />
            <Toggle
              label="Use my interests & boundaries checklist"
              checked={settings.use_checklist}
              onChange={(use_checklist) => change({ use_checklist })}
            />
            <Toggle
              label="Use my active hanky signals for chemistry"
              checked={settings.use_hanky}
              onChange={(use_hanky) => change({ use_hanky })}
            />
            <Toggle
              label="Use my flags and My Lines for a small shared-culture preference"
              checked={settings.use_culture}
              onChange={(use_culture) => change({ use_culture })}
            />
          </fieldset>

          <div className="space-y-6">
            {MATCHING_FIELDS.map((field) => {
              const rule = settings.rules[field.key] ?? { strength: 'any' as const, values: [] };
              return (
                <fieldset key={field.key} className="border-t border-border pt-4">
                  <legend className="font-bold text-sm">{field.label}</legend>
                  <Strength
                    label={`${field.label}: importance`}
                    value={rule.strength}
                    onChange={(strength) => ruleChange(field.key, strength, rule.values)}
                  />
                  {rule.strength !== 'any' && (
                    <>
                      <Choices
                        label={`${field.label}: options`}
                        options={field.options}
                        selected={rule.values}
                        onChange={(values) => ruleChange(field.key, rule.strength, values)}
                      />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {'all' in field && field.all
                          ? 'Every selected option must be met when required.'
                          : 'Any selected option can qualify.'}
                      </p>
                    </>
                  )}
                </fieldset>
              );
            })}
          </div>

          <fieldset className="space-y-4 border-t border-border pt-4">
            <legend className="font-bold">Distance</legend>
            <p className="text-sm text-muted-foreground">
              Uses chosen discovery, travel or home cities, approximately. Unknown locations cannot
              meet a required distance. Exact GPS is never used here.
            </p>
            <Strength
              label="Distance: importance"
              value={settings.distance_strength}
              onChange={(distance_strength) => change({ distance_strength })}
            />
            {settings.distance_strength !== 'any' && (
              <label className="block text-sm">
                Maximum distance (km)
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={20000}
                  value={settings.max_distance_km ?? ''}
                  onChange={(e) => change({ max_distance_km: numberOrNull(e.target.value) })}
                />
              </label>
            )}
          </fieldset>
          <fieldset className="space-y-4 border-t border-border pt-4">
            <legend className="font-bold">Height</legend>
            <Strength
              label="Height: importance"
              value={settings.height_strength}
              onChange={(height_strength) => change({ height_strength })}
            />
            {settings.height_strength !== 'any' && (
              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm">
                  Minimum (cm)
                  <input
                    className={inputClass}
                    type="number"
                    min={50}
                    max={300}
                    value={settings.min_height_cm ?? ''}
                    onChange={(e) => change({ min_height_cm: numberOrNull(e.target.value) })}
                  />
                </label>
                <label className="text-sm">
                  Maximum (cm)
                  <input
                    className={inputClass}
                    type="number"
                    min={50}
                    max={300}
                    value={settings.max_height_cm ?? ''}
                    onChange={(e) => change({ max_height_cm: numberOrNull(e.target.value) })}
                  />
                </label>
              </div>
            )}
          </fieldset>

          <p className="text-sm text-muted-foreground">
            Orientation labels, pronouns and pride flags never imply attraction. Coming-out status
            and health information are never ranking signals. Set your attraction preferences
            explicitly above. A scene signal or a match is never consent to an activity.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save matching preferences'}
            </Button>
            <Link to="/meet/dating" className="text-sm underline">
              Open dating discovery
            </Link>
          </div>
          {feedback && (
            <p
              role={save.isError || matchingSettingsError(settings) ? 'alert' : 'status'}
              className="text-sm"
            >
              {feedback}
            </p>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function numberOrNull(value: string) {
  return value === '' ? null : Number(value);
}
function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        className="mt-1"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function Strength({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PreferenceStrength;
  onChange: (value: PreferenceStrength) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value as PreferenceStrength)}
      >
        <option value="any">No preference</option>
        <option value="preferred">Preferred</option>
        <option value="required">Required</option>
      </select>
    </label>
  );
}
function Choices({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((value) => (
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
            {matchingLabel(value)}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
