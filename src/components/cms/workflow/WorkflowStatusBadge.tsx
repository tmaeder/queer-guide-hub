/**
 * WorkflowStatusBadge
 * Colored MUI Chip that displays the current workflow state with a dot indicator.
 */

import { Chip } from '@mui/material';
import { getStateColor, getStateLabel } from '@/config/workflowConfig';
import type { WorkflowState } from '@/types/cms';

interface WorkflowStatusBadgeProps {
  state: WorkflowState;
  size?: 'sm' | 'md';
}

export function WorkflowStatusBadge({ state, size = 'md' }: WorkflowStatusBadgeProps) {
  const color = getStateColor(state);
  const label = getStateLabel(state);

  return (
    <Chip
      size={size === 'sm' ? 'small' : 'medium'}
      label={label}
      icon={
        <span
          style={{
            width: size === 'sm' ? 6 : 8,
            height: size === 'sm' ? 6 : 8,
            borderRadius: '50%',
            backgroundColor: color,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      }
      sx={{
        backgroundColor: `${color}14`,
        color,
        fontWeight: 600,
        fontSize: size === 'sm' ? '0.7rem' : '0.8rem',
        borderColor: `${color}40`,
        borderWidth: 1,
        borderStyle: 'solid',
        '& .MuiChip-icon': {
          marginLeft: size === 'sm' ? '6px' : '8px',
          marginRight: '-2px',
        },
      }}
    />
  );
}
