import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { TravelPreferencesEditor } from '@/components/profile/TravelPreferencesEditor';

/**
 * A calm, always-present entry point to the canonical travel-preferences editor
 * (also reachable from /settings → Travel preferences). Travel personalization is
 * standard, not an optional nudge — there is no dismiss.
 */
export function TravelPrefsPrompt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const handleClose = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // prefs may have been saved inside the sheet — refresh anything reading them
      queryClient.invalidateQueries({ queryKey: ['has-travel-prefs', user.id] });
    }
  };

  return (
    <div className="flex justify-end mb-6">
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4 mr-2" />
        Travel preferences
      </Button>
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
    </div>
  );
}
