/**
 * Quick venue-taste quiz that seeds profiles.discovery_profile, which the
 * rpc_venues_ranked function reads for interest-aware ranking.
 *
 * 4 steps: categories, target groups, tags/vibes, primary city.
 * Routed at /onboarding/venues.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { saveDiscoveryProfile, useCityAutocomplete } from '@/hooks/useVenuesV2Data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
  'bar',
  'restaurant',
  'club',
  'hotel',
  'sauna',
  'community_center',
  'theater',
  'gallery',
  'gym',
  'salon',
];

const TARGET_GROUPS = [
  'lesbian',
  'gay',
  'bisexual',
  'transgender',
  'queer',
  'intersex',
  'asexual',
  'non-binary',
  'two-spirit',
];

const TAGS = [
  'cruisy',
  'artsy',
  'mixed',
  'leather',
  'family-friendly',
  'sober',
  'kink',
  'drag',
  'live-music',
  'cocktails',
  'dance-floor',
  'cabaret',
];

type Step = 0 | 1 | 2 | 3;

const VenuePersonalization = () => {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [cityChoice, setCityChoice] = useState<{ id: string; name: string } | null>(null);
  const cityMatches = useCityAutocomplete(city);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  const toggle = (arr: string[], setter: (next: string[]) => void, v: string) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const discovery_profile = {
      categories,
      target_groups: groups,
      tags,
      primary_city_id: cityChoice?.id ?? null,
      primary_city_name: cityChoice?.name ?? city ?? null,
      onboarded_at: new Date().toISOString(),
    };
    const { error } = await saveDiscoveryProfile(user.id, discovery_profile);
    setSaving(false);
    if (error) {
      toast({ title: t('venues.onboarding.saveError', 'Could not save'), variant: 'destructive' });
      return;
    }
    toast({ title: t('venues.onboarding.saveSuccess', 'Tastes saved') });
    navigate('/venues');
  };

  const stepTitles = useMemo(
    () => [
      t('venues.onboarding.step1.title', 'What kinds of venues do you love?'),
      t('venues.onboarding.step2.title', 'Which communities do you call home?'),
      t('venues.onboarding.step3.title', 'What vibes are you here for?'),
      t('venues.onboarding.step4.title', 'Where do you spend most of your time?'),
    ],
    [t],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {t('venues.onboarding.progress', { current: step + 1, total: 4, defaultValue: 'Step {{current}} of {{total}}' })}
        </p>
        <h1 className="text-headline font-semibold">{stepTitles[step]}</h1>
      </header>

      {step === 0 && (
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Badge
              key={c}
              variant={categories.includes(c) ? 'default' : 'outline'}
              className="cursor-pointer capitalize"
              onClick={() => toggle(categories, setCategories, c)}
            >
              {c.replace(/[_-]/g, ' ')}
            </Badge>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-wrap gap-2">
          {TARGET_GROUPS.map((g) => (
            <Badge
              key={g}
              variant={groups.includes(g) ? 'default' : 'outline'}
              className="cursor-pointer capitalize"
              onClick={() => toggle(groups, setGroups, g)}
            >
              {g}
            </Badge>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-wrap gap-2">
          {TAGS.map((tg) => (
            <Badge
              key={tg}
              variant={tags.includes(tg) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggle(tags, setTags, tg)}
            >
              {tg}
            </Badge>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Input
            placeholder={t('venues.onboarding.cityPlaceholder', 'Type your city')}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setCityChoice(null);
            }}
          />
          {cityMatches.length > 0 && !cityChoice && (
            <ul className="border rounded-container divide-y bg-card">
              {cityMatches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-accent"
                    onClick={() => {
                      setCityChoice(m);
                      setCity(m.name);
                      setCityMatches([]);
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cityChoice && (
            <p className="text-sm text-muted-foreground">
              {t('venues.onboarding.citySelected', { city: cityChoice.name, defaultValue: 'Selected: {{city}}' })}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, (s - 1) as Step))}
        >
          {t('common.back', 'Back')}
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((s) => Math.min(3, (s + 1) as Step))}>
            {t('common.next', 'Next')}
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving', 'Saving…') : t('venues.onboarding.finish', 'Finish')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default VenuePersonalization;
