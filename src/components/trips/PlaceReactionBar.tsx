import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import {
  REACTION_EMOJIS,
  useToggleReaction,
  type PlaceReactionSummary,
} from '@/hooks/useTripReactions';

interface Props {
  tripId: string;
  placeId: string;
  summary: PlaceReactionSummary | undefined;
  /** Disable interaction (e.g. on the owner's view or signed-out read-only). */
  disabled?: boolean;
}

/**
 * Inline emoji reaction bar for a single trip place on the shared-trip
 * page. Shows the 5 supported emojis with counts; tapping toggles the
 * viewer's reaction on/off (fingerprint-scoped for anon visitors).
 * Active emojis are visually lit; inactive emojis sit low-opacity so
 * the bar doesn't steal focus from the itinerary content.
 */
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
    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
      {chips.map(({ emoji, count, mine }) => (
        <Tooltip key={emoji} title={mine ? 'You reacted' : 'React'} placement="top">
          <Box
            component="button"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleClick(emoji, mine);
            }}
            disabled={disabled}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              fontSize: 13,
              lineHeight: 1,
              border: 'none',
              background: 'transparent',
              cursor: disabled ? 'default' : 'pointer',
              opacity: count > 0 || mine ? 1 : 0.5,
              color: 'text.primary',
              transition: 'opacity 0.15s, transform 0.15s',
              '&:hover': disabled ? {} : { transform: 'scale(1.1)', opacity: 1 },
              padding: '2px 4px',
              fontWeight: mine ? 700 : 400,
            }}
          >
            <span style={{ fontSize: 14 }}>{emoji}</span>
            {count > 0 && <span style={{ fontSize: 11 }}>{count}</span>}
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}
