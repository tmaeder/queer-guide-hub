import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { fetchProfileTravelPreferences } from '@/hooks/useTravelPreferencesEditor';

const DISMISSED_KEY = 'qg_travel_prefs_dismissed';

export function TravelPrefsPrompt() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === '1');

  const { data: hasPrefs } = useQuery({
    queryKey: ['has-travel-prefs', user?.id],
    queryFn: async () => {
      if (!user) return true;
      const prefs = await fetchProfileTravelPreferences(user.id);
      return prefs && Object.keys(prefs).length > 0;
    },
    enabled: !!user && !dismissed,
    staleTime: 60 * 60 * 1000,
  });

  if (!user || dismissed || hasPrefs !== false) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-4 p-4 mb-6 bg-muted/40 rounded-lg">
      <Sparkles className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1">
        <p className="font-semibold text-sm">Personalize your travel</p>
        <p className="text-xs text-muted-foreground">
          Set your budget, safety preferences, and interests for better recommendations.
        </p>
      </div>
      <LocalizedLink to="/profile/settings?tab=travel">
        <Button size="sm">Set up</Button>
      </LocalizedLink>
      <Button variant="ghost" size="sm" onClick={handleDismiss} style={{ padding: 4, minWidth: 0 }}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
