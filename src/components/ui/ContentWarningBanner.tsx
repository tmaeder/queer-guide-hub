/**
 * ContentWarningBanner — Displays content sensitivity warnings to users.
 *
 * Reads from `content_warnings` JSONB field on venues, events, news, etc.
 * Shows appropriate warning for legal, medical, NSFW content.
 */

import React, { useState } from 'react';
import { AlertTriangle, Scale, Stethoscope, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

  if (compact) {
    return (
      <div className="flex gap-1 flex-wrap">
        {activeFlags.map((flag) => {
          const config = FLAG_CONFIG[flag];
          const Icon = config.icon;
          return (
            <Badge
              key={flag}
              variant="outline"
              className="h-[22px] text-[0.7rem] gap-1"
              style={{ borderColor: config.color, color: config.color }}
            >
              <Icon size={12} />
              {config.label}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-3 p-4 border border-yellow-500/40 bg-yellow-500/10 rounded-md">
      <AlertTriangle size={20} className="text-yellow-700 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold mb-1">Content Notice</p>
        <div className={`flex gap-1 flex-wrap ${warnings.warnings?.length ? 'mb-2' : ''}`}>
          {activeFlags.map((flag) => {
            const config = FLAG_CONFIG[flag];
            const Icon = config.icon;
            return (
              <Badge key={flag} variant="secondary" className="text-xs gap-1 whitespace-normal py-1 h-auto">
                <Icon size={12} />
                {config.message}
              </Badge>
            );
          })}
        </div>
        {warnings.warnings?.map((w, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            {w}
          </p>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
        Dismiss
      </Button>
    </div>
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
    <div className="flex gap-1 flex-wrap items-center">
      {relevanceScore != null && (
        <Badge
          className="h-5 text-[0.65rem] font-bold"
          style={{
            backgroundColor: relevanceScore >= 0.7 ? '#dcfce7' : relevanceScore >= 0.3 ? '#fef9c3' : '#fee2e2',
            color: relevanceScore >= 0.7 ? '#166534' : relevanceScore >= 0.3 ? '#854d0e' : '#991b1b',
          }}
        >
          {`${(relevanceScore * 100).toFixed(0)}%`}
        </Badge>
      )}
      {sensitivityFlags?.map((flag) => {
        const config = FLAG_CONFIG[flag.category as keyof typeof FLAG_CONFIG];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <Badge
            key={flag.category}
            variant="outline"
            className="h-5 text-[0.65rem] gap-1"
            style={{ borderColor: config.color, color: config.color }}
          >
            <Icon size={10} />
            {config.label}
          </Badge>
        );
      })}
    </div>
  );
};

export default ContentWarningBanner;
