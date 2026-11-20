import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { SPOKEN_LANGUAGES, VIBES, vibeLabel } from '@/lib/searchVibes';
import type { Profile } from '@/hooks/useProfile';

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  const list = (value as { list?: unknown } | null)?.list;
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Vibes (profiles.interests) and spoken languages (profiles.languages). Both
 * were only editable in /onboarding/search. Each tap saves.
 */
export function VibesLanguagesEditor({
  profile,
  onUpdate,
}: {
  profile: Profile | null | undefined;
  onUpdate: (updates: Record<string, unknown>) => Promise<unknown>;
}) {
  const p = (profile ?? {}) as Record<string, unknown>;
  // Local copies so a tap shows at once; the saved row catches up on refetch.
  const [vibes, setVibes] = useState<string[] | null>(null);
  const [langs, setLangs] = useState<string[] | null>(null);
  const currentVibes = vibes ?? asList(p.interests);
  const currentLangs = langs ?? asList(p.languages);

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vibes & languages</CardTitle>
        <p className="text-sm text-muted-foreground">
          Used to rank places and events for you. Saved as you tap.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section aria-labelledby="settings-vibes" className="flex flex-col gap-2">
          <h4 id="settings-vibes" className="text-sm font-medium">
            Vibes
          </h4>
          <div role="group" aria-labelledby="settings-vibes" className="flex flex-wrap gap-1.5">
            {VIBES.map((v) => (
              <ToggleChip
                key={v}
                pressed={currentVibes.includes(v)}
                onPressedChange={() => {
                  const next = toggle(currentVibes, v);
                  setVibes(next);
                  void onUpdate({ interests: next });
                }}
              >
                <span className="capitalize">{vibeLabel(v)}</span>
              </ToggleChip>
            ))}
          </div>
        </section>
        <section aria-labelledby="settings-langs" className="flex flex-col gap-2">
          <h4 id="settings-langs" className="text-sm font-medium">
            Languages you speak
          </h4>
          <div role="group" aria-labelledby="settings-langs" className="flex flex-wrap gap-1.5">
            {SPOKEN_LANGUAGES.map((l) => (
              <ToggleChip
                key={l.code}
                pressed={currentLangs.includes(l.code)}
                onPressedChange={() => {
                  const next = toggle(currentLangs, l.code);
                  setLangs(next);
                  void onUpdate({ languages: next });
                }}
              >
                <span lang={l.code}>{l.label}</span>
              </ToggleChip>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
