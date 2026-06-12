import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { fetchProfileTravelPreferences } from '@/hooks/useTravelPreferencesEditor';
import { TravelPreferencesEditor } from '@/components/profile/TravelPreferencesEditor';

const DISMISSED_KEY = 'qg_travel_prefs_dismissed';

/**
 * In-context capture: travel preferences are set right here in the trips
 * surface (sheet), not in a settings form. Settings only mirrors them.
 */
export function TravelPrefsPrompt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === '1');
  const [open, setOpen] = useState(false);

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

  if (!user) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const handleClose = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // prefs may have been saved inside the sheet — refresh the gate
      queryClient.invalidateQueries({ queryKey: ['has-travel-prefs', user.id] });
    }
  };

  const sheet = (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-4 pb-8 sm:px-6">
        <SheetHeader className="text-left">
          <SheetTitle>Travel preferences</SheetTitle>
          <SheetDescription>
            Used to rank trips, stays and places for you. Review or clear them anytime in settings.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <TravelPreferencesEditor />
        </div>
      </SheetContent>
    </Sheet>
  );

  // Prefs already set (or banner dismissed): keep a quiet edit entry point —
  // this sheet is where travel prefs live; settings only mirrors them.
  if (dismissed || hasPrefs !== false) {
    return (
      <div className="flex justify-end mb-6">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Sparkles className="h-4 w-4 mr-2" />
          Travel preferences
        </Button>
        {sheet}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-4 mb-6 bg-muted/40 rounded-element">
      <Sparkles className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1">
        <p className="font-semibold text-sm">Personalize your travel</p>
        <p className="text-xs text-muted-foreground">
          Set your budget, safety preferences, and interests for better recommendations.
        </p>
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>
        Set up
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        style={{ minWidth: 0 }}
        className="p-1"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>

      {sheet}
    </div>
  );
}
