import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { X, Accessibility } from 'lucide-react';
import type { Profile } from '@/hooks/useProfile';

interface TravelPrefs {
  budget_level?: string;
  interests?: string[];
  accessibility_needs?: string[];
  preferred_accommodation?: string[];
  travel_style?: string;
}

interface PreferencesMirrorCardProps {
  profile: Profile | null | undefined;
  onUpdate: (updates: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Review-only mirror of preferences captured in context. Settings can CLEAR a
 * preference but never set one — adding happens where you search, filter and
 * plan trips, so the payoff is visible at the moment of capture.
 */
export function PreferencesMirrorCard({ profile, onUpdate }: PreferencesMirrorCardProps) {
  const p = (profile ?? {}) as Record<string, unknown>;
  const interests = Array.isArray(p.interests) ? (p.interests as string[]) : [];
  const travel = (p.travel_preferences ?? {}) as TravelPrefs;
  const accessibility = Array.isArray(travel.accessibility_needs) ? travel.accessibility_needs : [];

  const removeInterest = (vibe: string) =>
    onUpdate({ interests: interests.filter((i) => i !== vibe) });

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
    interests.length === 0 && accessibility.length === 0 && !travel.budget_level && !travel.travel_style;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your preferences</CardTitle>
        <p className="text-sm text-muted-foreground">
          Saved from your searches, filters and trips. Remove anything here — to add or change,
          use the filters where you search.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isEmpty && (
          <p className="text-sm text-muted-foreground">
            No preferences yet. They build up as you{' '}
            <LocalizedLink to="/search" className="underline underline-offset-4">search</LocalizedLink>,{' '}
            <LocalizedLink to="/onboarding/search" className="underline underline-offset-4">pick your vibes</LocalizedLink>{' '}
            or plan <LocalizedLink to="/trips" className="underline underline-offset-4">trips</LocalizedLink>.
          </p>
        )}

        {interests.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Vibes</p>
              <LocalizedLink to="/onboarding/search" className="text-xs underline underline-offset-4">
                Edit where they're set
              </LocalizedLink>
            </div>
            <div className="flex flex-wrap gap-2">
              {interests.map((vibe) => (
                <Badge key={vibe} variant="secondary" className="rounded-badge gap-1 pr-1">
                  {vibe}
                  <button
                    type="button"
                    aria-label={`Forget ${vibe}`}
                    className="rounded-badge p-0.5 hover:bg-accent"
                    onClick={() => removeInterest(vibe)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {travel.budget_level && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Budget</p>
              <LocalizedLink to="/trips" className="text-xs underline underline-offset-4">
                Set in trip planner
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
              <LocalizedLink to="/venues" className="text-xs underline underline-offset-4">
                Edit in venue filters
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
              Only you see these. We use them to rank and badge places for you — never on your profile.
            </p>
          </div>
        )}

        {!isEmpty && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button asChild variant="outline" size="sm" className="rounded-element">
              <LocalizedLink to="/onboarding/search">Vibes & languages</LocalizedLink>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-element">
              <LocalizedLink to="/venues">Accessibility filters</LocalizedLink>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-element">
              <LocalizedLink to="/trips">Trip preferences</LocalizedLink>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
