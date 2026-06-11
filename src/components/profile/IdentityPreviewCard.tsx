import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Eye, EyeOff, Pencil } from 'lucide-react';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import type { AvatarConfig } from '@/components/profile/AvatarBuilder';
import { cn } from '@/lib/utils';

export type VisibilityLens = 'public' | 'community' | 'private';

const LENS_LABEL: Record<VisibilityLens, string> = {
  public: 'Anyone',
  community: 'Community',
  private: 'Only you',
};
const LENS_ORDER: VisibilityLens[] = ['public', 'community', 'private'];

/** Does a field with `vis` (public|friends|private) show at `lens`? */
function visibleAt(vis: string | undefined, lens: VisibilityLens): boolean {
  const v = vis ?? 'public';
  if (lens === 'private') return true;
  if (lens === 'community') return v === 'public' || v === 'friends';
  return v === 'public';
}

interface IdentityPreviewCardProps {
  displayName: string;
  username: string | null;
  pronouns: string;
  pronounsVisibility?: string;
  occupation: string;
  bio: string;
  avatarUrl?: string | null;
  avatarConfig?: AvatarConfig | null;
  email: string;
  completion: number;
  onEditAvatar: () => void;
  onEditProfile: () => void;
  onEditAccount: () => void;
}

/**
 * Live preview of the profile exactly as others see it. Tap an element to
 * edit it; the lens toggle previews public / community / only-you views so
 * privacy controls have a visible payoff.
 */
export function IdentityPreviewCard(props: IdentityPreviewCardProps) {
  const [lens, setLens] = useState<VisibilityLens>('private');

  const pronounsVisible = visibleAt(props.pronounsVisibility, lens);
  const hasPronouns = props.pronouns.trim().length > 0;
  const hasOccupation = props.occupation.trim().length > 0;

  const cycleLens = () =>
    setLens((l) => LENS_ORDER[(LENS_ORDER.indexOf(l) + 1) % LENS_ORDER.length]);

  return (
    <Card className="rounded-container">
      <CardContent className="pt-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={props.onEditAvatar}
            aria-label="Edit avatar"
            className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
          >
            <AvatarDisplay
              avatarUrl={props.avatarUrl ?? undefined}
              avatarConfig={props.avatarConfig ?? undefined}
              email={props.email}
              size="lg"
            />
            <span className="absolute -bottom-1 -right-1 rounded-full border border-border bg-background p-1">
              <Pencil size={10} aria-hidden="true" />
            </span>
          </button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={cycleLens}
            className="rounded-element shrink-0"
            aria-label={`Previewing as: ${LENS_LABEL[lens]}. Tap to switch view.`}
          >
            <Eye size={14} className="mr-2" aria-hidden="true" />
            {LENS_LABEL[lens]}
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={props.onEditProfile}
            className="text-left font-semibold text-lg hover:underline underline-offset-4"
          >
            {props.displayName || <span className="text-muted-foreground font-normal">Add your name</span>}
          </button>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <button
              type="button"
              onClick={props.onEditAccount}
              className="hover:underline underline-offset-4 font-mono"
            >
              {props.username ? `@${props.username}` : 'Claim your @username'}
            </button>

            {hasPronouns ? (
              <button
                type="button"
                onClick={props.onEditProfile}
                className={cn(
                  'inline-flex items-center gap-1 hover:underline underline-offset-4',
                  !pronounsVisible && 'opacity-50',
                )}
              >
                · {props.pronouns}
                {!pronounsVisible && <EyeOff size={12} aria-label="Hidden in this view" />}
              </button>
            ) : (
              lens === 'private' && (
                <button
                  type="button"
                  onClick={props.onEditProfile}
                  className="hover:underline underline-offset-4"
                >
                  · Add pronouns
                </button>
              )
            )}

            {hasOccupation && (
              <button
                type="button"
                onClick={props.onEditProfile}
                className="hover:underline underline-offset-4"
              >
                · {props.occupation}
              </button>
            )}
          </div>

          {props.bio.trim() && (
            <button
              type="button"
              onClick={props.onEditProfile}
              className="text-left text-sm mt-2 line-clamp-2 hover:underline underline-offset-4"
            >
              {props.bio}
            </button>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">Profile completion</p>
            <p className="text-xs text-muted-foreground">{props.completion}%</p>
          </div>
          <Progress value={props.completion} className="h-1" aria-label={`Profile ${props.completion} percent complete`} />
        </div>
      </CardContent>
    </Card>
  );
}
