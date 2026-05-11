/**
 * ContentWarningBanner — content sensitivity warnings.
 *
 * Reads from `content_warnings` JSONB on venues, events, news, etc.
 * Strict-monochrome: warnings are differentiated by icon + bold label,
 * not hue. The relevance-score badge collapses to the same neutral
 * treatment with the score communicated by text only.
 */

import React, { useState } from 'react';
import { AlertTriangle, Scale, Stethoscope, EyeOff, X } from 'lucide-react';
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
    message: 'Discusses legal matters, laws, or regulations.',
  },
  medical: {
    icon: Stethoscope,
    label: 'Medical',
    message: 'Contains medical or health information.',
  },
  nsfw: {
    icon: EyeOff,
    label: 'NSFW',
    message: 'May contain adult or explicit material.',
  },
} as const;

export const ContentWarningBanner = ({
  warnings,
  compact = false,
}: ContentWarningBannerProps) => {
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
      <div className="flex flex-wrap gap-1">
        {activeFlags.map((flag) => {
          const config = FLAG_CONFIG[flag];
          const Icon = config.icon;
          return (
            <Badge key={flag} variant="outline" className="h-[22px] gap-1">
              <Icon size={12} aria-hidden="true" />
              {config.label}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-3 border border-foreground bg-background p-4">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-foreground" aria-hidden="true" />
      <div className="flex-1">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide">Content Notice</p>
        <ul className={`flex flex-col gap-1 ${warnings.warnings?.length ? 'mb-2' : ''}`}>
          {activeFlags.map((flag) => {
            const config = FLAG_CONFIG[flag];
            const Icon = config.icon;
            return (
              <li key={flag} className="flex items-start gap-2 text-sm">
                <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span><span className="font-semibold">{config.label}.</span> {config.message}</span>
              </li>
            );
          })}
        </ul>
        {warnings.warnings?.map((w, i) => (
          <p key={i} className="text-sm text-muted-foreground">{w}</p>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Dismiss notice">
        <X size={16} aria-hidden="true" />
      </Button>
    </div>
  );
};

/**
 * Compact flag badges for admin tables and review cards. Score is text,
 * not hue; severity reads from icon + label, not color.
 */
export const SensitivityBadges = ({ sensitivityFlags, relevanceScore }: {
  sensitivityFlags?: Array<{ category: string; severity: string }> | null;
  relevanceScore?: number | null;
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {relevanceScore != null && (
        <Badge variant="outline" className="h-5">
          {`${(relevanceScore * 100).toFixed(0)}%`}
        </Badge>
      )}
      {sensitivityFlags?.map((flag) => {
        const config = FLAG_CONFIG[flag.category as keyof typeof FLAG_CONFIG];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <Badge key={flag.category} variant="outline" className="h-5 gap-1">
            <Icon size={10} aria-hidden="true" />
            {config.label}
          </Badge>
        );
      })}
    </div>
  );
};

export default ContentWarningBanner;
