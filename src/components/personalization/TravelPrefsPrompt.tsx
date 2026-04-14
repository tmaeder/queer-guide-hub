import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Sparkles, X } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const DISMISSED_KEY = 'qg_travel_prefs_dismissed';

export function TravelPrefsPrompt() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === '1');

  const { data: hasPrefs } = useQuery({
    queryKey: ['has-travel-prefs', user?.id],
    queryFn: async () => {
      if (!user) return true;
      const { data } = await supabase
        .from('profiles')
        .select('travel_preferences')
        .eq('user_id', user.id)
        .single();
      const prefs = data?.travel_preferences as Record<string, unknown> | null;
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
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        mb: 3,
        bgcolor: 'action.hover',
        borderRadius: 1,
      }}
    >
      <Sparkles style={{ height: 20, width: 20, color: 'var(--primary)', flexShrink: 0 }} />
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
          Personalize your travel
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          Set your budget, safety preferences, and interests for better recommendations.
        </Typography>
      </Box>
      <LocalizedLink to="/profile/settings?tab=travel">
        <Button size="sm">Set up</Button>
      </LocalizedLink>
      <Button variant="ghost" size="sm" onClick={handleDismiss} style={{ padding: 4, minWidth: 0 }}>
        <X style={{ height: 16, width: 16 }} />
      </Button>
    </Box>
  );
}
