import { useState } from 'react';
import { AtSign, Sparkles, Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { getProfileGap, dismissPrompt } from '@/lib/profileGaps';

interface GapPromptCardProps {
  profile: Record<string, unknown>;
}

/**
 * One gap-driven nudge, priority username > avatar > pronouns. Moved from the
 * settings hub to the profile Overview where the owner actually looks.
 */
export function GapPromptCard({ profile }: GapPromptCardProps) {
  const navigate = useLocalizedNavigate();
  const [tick, setTick] = useState(0);
  void tick;

  const prompt = getProfileGap(profile);

  if (!prompt) return null;

  const dismiss = (kind: string) => {
    dismissPrompt(kind);
    setTick((t) => t + 1);
  };

  return (
    <Card className="rounded-container border-border/60">
      <CardContent className="pt-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-element bg-muted flex items-center justify-center shrink-0">
          {prompt.kind === 'username' ? (
            <AtSign size={18} aria-hidden="true" />
          ) : prompt.kind === 'travel' ? (
            <Luggage size={18} aria-hidden="true" />
          ) : (
            <Sparkles size={18} aria-hidden="true" />
          )}
        </div>
        <div className="flex-1">
          <p className="font-semibold">{prompt.title}</p>
          <p className="text-13 text-muted-foreground">{prompt.body}</p>
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              className="rounded-element"
              onClick={() => navigate(`/settings?section=${prompt.section}`)}
            >
              {prompt.cta}
            </Button>
            {prompt.kind !== 'username' && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-element"
                onClick={() => dismiss(prompt.kind)}
              >
                Later
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
