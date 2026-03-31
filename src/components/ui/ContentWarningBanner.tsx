/**
 * ContentWarningBanner — Displays content sensitivity warnings to users.
 *
 * Reads from `content_warnings` JSONB field on venues, events, news, etc.
 * Shows appropriate warning for legal, medical, NSFW content.
 */

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { AlertTriangle, Scale, Stethoscope, EyeOff } from 'lucide-react';

interface ContentWarnings {
  legal?: boolean;
  medical?: boolean;
  nsfw?: boolean;
  warnings?: string[];
}

interface ContentWarningBannerProps {
  warnings: ContentWarnings | null | undefined;
  compact?: boolean;
}

const FLAG_CONFIG = {
  legal: {
    icon: Scale,
    label: 'Legal',
    color: '#d97706' as const,
    message: 'This content discusses legal matters, laws, or regulations.',
  },
  medical: {
    icon: Stethoscope,
    label: 'Medical',
    color: '#2563eb' as const,
    message: 'This content contains medical or health-related information.',
  },
  nsfw: {
    icon: EyeOff,
    label: 'NSFW',
    color: '#dc2626' as const,
    message: 'This content may contain adult or explicit material.',
  },
} as const;

export const ContentWarningBanner: React.FC<ContentWarningBannerProps> = ({
  warnings,
  compact = false,
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (!warnings || dismissed) return null;

  const activeFlags = (['legal', 'medical', 'nsfw'] as const).filter(
    (key) => warnings[key],
  );

  if (activeFlags.length === 0 && (!warnings.warnings || warnings.warnings.length === 0)) {
    return null;
  }

  // Compact mode: just show chips inline
  if (compact) {
    return (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {activeFlags.map((flag) => {
          const config = FLAG_CONFIG[flag];
          const Icon = config.icon;
          return (
            <Chip
              key={flag}
              icon={<Icon size={12} />}
              label={config.label}
              size="small"
              variant="outlined"
              sx={{
                height: 22,
                fontSize: '0.7rem',
                borderColor: config.color,
                color: config.color,
                '& .MuiChip-icon': { color: config.color },
              }}
            />
          );
        })}
      </Box>
    );
  }

  // Full banner mode
  return (
    <Alert
      severity="warning"
      icon={<AlertTriangle size={20} />}
      action={
        <Button color="inherit" size="small" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      }
      sx={{ mb: 2 }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Content Notice
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: warnings.warnings?.length ? 1 : 0 }}>
          {activeFlags.map((flag) => {
            const config = FLAG_CONFIG[flag];
            const Icon = config.icon;
            return (
              <Chip
                key={flag}
                icon={<Icon size={12} />}
                label={config.message}
                size="small"
                sx={{
                  height: 'auto',
                  '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 },
                  fontSize: '0.75rem',
                }}
              />
            );
          })}
        </Box>
        {warnings.warnings?.map((w, i) => (
          <Typography key={i} variant="body2" color="text.secondary">
            {w}
          </Typography>
        ))}
      </Box>
    </Alert>
  );
};

/**
 * Compact flag badges for admin tables and review cards.
 */
export const SensitivityBadges: React.FC<{
  sensitivityFlags?: Array<{ category: string; severity: string }> | null;
  relevanceScore?: number | null;
}> = ({ sensitivityFlags, relevanceScore }) => {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {relevanceScore != null && (
        <Chip
          label={`${(relevanceScore * 100).toFixed(0)}%`}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 700,
            bgcolor: relevanceScore >= 0.7
              ? '#dcfce7'
              : relevanceScore >= 0.3
                ? '#fef9c3'
                : '#fee2e2',
            color: relevanceScore >= 0.7
              ? '#166534'
              : relevanceScore >= 0.3
                ? '#854d0e'
                : '#991b1b',
          }}
        />
      )}
      {sensitivityFlags?.map((flag) => {
        const config = FLAG_CONFIG[flag.category as keyof typeof FLAG_CONFIG];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <Chip
            key={flag.category}
            icon={<Icon size={10} />}
            label={config.label}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              borderColor: config.color,
              color: config.color,
              '& .MuiChip-icon': { color: config.color },
            }}
            variant="outlined"
          />
        );
      })}
    </Box>
  );
};

export default ContentWarningBanner;
