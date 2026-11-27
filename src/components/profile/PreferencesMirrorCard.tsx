import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { X, Accessibility } from '@/components/icons';
import type { Profile } from '@/hooks/useProfile';

interface TravelPrefs {
  budget_level?: string;
  interests?: string[];
  accessibility_needs?: string[];
  preferred_accommodation?: string[];
  travel_style?: string | string[];
}

interface PreferencesMirrorCardProps {
  profile: Profile | null | undefined;
  onUpdate: (updates: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Read-only summary of the preferences that power search, trips and recs. Edit
 * travel prefs in the Travel preferences section above; vibes in Vibes &
 * languages. Each row can also be cleared (X) from here.
 */
export function PreferencesMirrorCard({ profile, onUpdate }: PreferencesMirrorCardProps) {
  const p = (profile ?? {}) as Record<string, unknown>;
  const travel = (p.travel_preferences ?? {}) as TravelPrefs;
  const accessibility = Array.isArray(travel.accessibility_needs) ? travel.accessibility_needs : [];

  const removeAccessibility = (need: string) =>
    onUpdate({
      travel_preferences: {
        ...travel,
        accessibility_needs: accessibility.filter((n) => n !== need),
      },
    });

  const clearBudget = () =>
    onUpdate({ travel_preferences: { ...travel, budget_level: undefined } });

  const isEmpty =
    accessibility.length === 0 &&
    !travel.budget_level &&
    !(Array.isArray(travel.travel_style) ? travel.travel_style.length : travel.travel_style);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your preferences</CardTitle>
        <p className="text-sm text-muted-foreground">
          What we use to rank places, stays and trips for you. Edit travel prefs in Travel
          preferences above; remove anything here.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isEmpty && (
          <p className="text-sm text-muted-foreground">
            No preferences yet. They build up as you{' '}
            <LocalizedLink to="/search" className="underline underline-offset-4">
              search
            </LocalizedLink>{' '}
            or plan{' '}
            <LocalizedLink to="/trips" className="underline underline-offset-4">
              trips
            </LocalizedLink>
            .
          </p>
        )}

        {travel.budget_level && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Budget</p>
              <LocalizedLink to="/settings/travel" className="text-xs underline underline-offset-4">
                Edit in Travel preferences
              </LocalizedLink>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-badge gap-1 pr-1">
                {travel.budget_level.replace('_', ' ')}
                <button
                  type="button"
                  aria-label="Forget budget preference"
                  className="rounded-badge p-0.5 hover:bg-accent"
                  onClick={clearBudget}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          </div>
        )}

        {accessibility.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Accessibility size={14} aria-hidden="true" /> Accessibility needs
              </p>
              <LocalizedLink to="/settings/travel" className="text-xs underline underline-offset-4">
                Edit in Travel preferences
              </LocalizedLink>
            </div>
            <div className="flex flex-wrap gap-2">
              {accessibility.map((need) => (
                <Badge key={need} variant="secondary" className="rounded-badge gap-1 pr-1">
                  {need.replace(/[-_]/g, ' ')}
                  <button
                    type="button"
                    aria-label={`Forget ${need}`}
                    className="rounded-badge p-0.5 hover:bg-accent"
                    onClick={() => removeAccessibility(need)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Only you see these. We use them to rank and badge places for you — never on your
              profile.
            </p>
          </div>
        )}

        {!isEmpty && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="outline" size="sm" className="rounded-element">
              <LocalizedLink to="/settings/travel">Travel preferences</LocalizedLink>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
