import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { normalizeSocialLinks, platformLabel } from '@/lib/social/registry';
import { platformIcon } from '@/lib/social/icons';

interface EntitySocialLinksProps {
  /** jsonb social_links map (platformKey -> url) from any entity. Accepts raw Json. */
  links?: unknown;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  /** Platform keys to omit (e.g. one already rendered elsewhere on the page). */
  exclude?: string[];
  className?: string;
}

const ICON_SIZE = { sm: 16, md: 18, lg: 22 } as const;

/**
 * Shared, monochrome social-link row for entity detail pages. Reads the
 * normalized social_links jsonb convention and renders brand icons via the
 * shared registry. Outbound links use rel="noopener nofollow".
 */
export function EntitySocialLinks({ links, size = 'md', showLabels = false, exclude, className }: EntitySocialLinksProps) {
  const entries = useMemo(() => {
    const skip = new Set(exclude ?? []);
    return Object.entries(normalizeSocialLinks(links as Record<string, unknown> | null)).filter(
      ([key]) => !skip.has(key),
    );
  }, [links, exclude]);
  if (entries.length === 0) return null;

  const iconSize = ICON_SIZE[size];

  return (
    <div className={`flex flex-wrap gap-2 ${showLabels ? 'flex-col items-start' : ''} ${className ?? ''}`}>
      {entries.map(([key, url]) => {
        const Icon = platformIcon(key);
        const label = platformLabel(key);
        return (
          <Button
            key={key}
            variant="outline"
            size={showLabels ? 'default' : 'icon'}
            asChild
            title={label}
          >
            <a href={url} target="_blank" rel="noopener nofollow" aria-label={label}>
              <Icon size={iconSize} />
              {showLabels && <span className="ml-2">{label}</span>}
            </a>
          </Button>
        );
      })}
    </div>
  );
}
