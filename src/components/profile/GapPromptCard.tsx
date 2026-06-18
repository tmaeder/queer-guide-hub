import { useState } from 'react';
import { AtSign, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

const PROMPT_DISMISS_KEY = 'qg.settings.prompt.dismissed';
const PROMPT_REDISPLAY_MS = 7 * 24 * 60 * 60 * 1000;

function promptDismissed(kind: string): boolean {
  try {
    const raw = localStorage.getItem(`${PROMPT_DISMISS_KEY}.${kind}`);
    return !!raw && Date.now() - Number(raw) < PROMPT_REDISPLAY_MS;
  } catch {
    return false;
  }
}

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

  const username = (profile.username as string | null) ?? null;
  const pronounTags = (profile.pronoun_tags as string[] | null) ?? [];

  let prompt: { kind: string; title: string; body: string; cta: string; section: string } | null =
    null;
  if (!username) {
    prompt = {
      kind: 'username',
      title: 'Claim your @username',
      body: 'Your permanent handle for mentions and your profile link.',
      cta: 'Claim now',
      section: 'account',
    };
  } else if (profile.avatar_auto_assigned && !promptDismissed('avatar')) {
    prompt = {
      kind: 'avatar',
      title: 'Make your avatar yours',
      body: 'We gave you a starter look. Upload a photo, import one, or build your own.',
      cta: 'Choose avatar',
      section: 'avatar',
    };
  } else if (pronounTags.length === 0 && !promptDismissed('pronouns')) {
    prompt = {
      kind: 'pronouns',
      title: 'Add your pronouns',
      body: 'Optional, takes 30 seconds. You decide who sees them.',
      cta: 'Add pronouns',
      section: 'profile',
    };
  }

  if (!prompt) return null;

  const dismiss = (kind: string) => {
    try {
      localStorage.setItem(`${PROMPT_DISMISS_KEY}.${kind}`, String(Date.now()));
    } catch {
      /* storage unavailable — prompt just stays */
    }
    setTick((t) => t + 1);
  };

  return (
    <Card className="rounded-container border-border/60">
      <CardContent className="pt-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-element bg-muted flex items-center justify-center shrink-0">
          {prompt.kind === 'username' ? (
            <AtSign size={18} aria-hidden="true" />
          ) : (
            <Sparkles size={18} aria-hidden="true" />
          )}
        </div>
        <div className="flex-1">
          <p className="font-semibold">{prompt.title}</p>
          <p className="text-sm text-muted-foreground">{prompt.body}</p>
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              className="rounded-element"
              onClick={() => navigate(`/settings?section=${prompt!.section}`)}
            >
              {prompt.cta}
            </Button>
            {prompt.kind !== 'username' && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-element"
                onClick={() => dismiss(prompt!.kind)}
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
