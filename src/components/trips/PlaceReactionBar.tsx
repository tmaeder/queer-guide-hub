import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  REACTION_EMOJIS,
  useToggleReaction,
  type PlaceReactionSummary,
} from '@/hooks/useTripReactions';

interface Props {
  tripId: string;
  placeId: string;
  summary: PlaceReactionSummary | undefined;
  disabled?: boolean;
}

export function PlaceReactionBar({ tripId, placeId, summary, disabled }: Props) {
  const toggle = useToggleReaction();

  const chips = useMemo(
    () =>
      REACTION_EMOJIS.map((emoji) => ({
        emoji,
        count: summary?.counts[emoji] ?? 0,
        mine: summary?.mine.has(emoji) ?? false,
      })),
    [summary],
  );

  const handleClick = (emoji: string, active: boolean) => {
    if (disabled || toggle.isPending) return;
    toggle.mutate({ tripId, placeId, emoji, active });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex gap-1 mt-1">
        {chips.map(({ emoji, count, mine }) => (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleClick(emoji, mine);
                }}
                disabled={disabled}
                className="inline-flex items-center gap-0.5 px-1 py-0.5 leading-none border-none bg-transparent transition hover:scale-110 hover:opacity-100 disabled:cursor-default text-foreground"
                style={{
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: count > 0 || mine ? 1 : 0.5,
                  fontSize: 13,
                  fontWeight: mine ? 700 : 400,
                }}
              >
                <span style={{ fontSize: 14 }}>{emoji}</span>
                {count > 0 && <span style={{ fontSize: 11 }}>{count}</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{mine ? 'You reacted' : 'React'}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
