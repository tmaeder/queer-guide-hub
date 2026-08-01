import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Image } from '@/components/ui/Image';
import type { ContentTypeConfig } from '@/types/cms';
import { getStatusColor, getStatusLabel, getStatusTint, type ListItem } from './types';

/**
 * Gallery view for any content type.
 *
 * Deliberately config-free: it reads `title`, `description`, `imageUrl` and
 * `status` off the normalized ListItem the controller already produces, so
 * every registered type gets this view without per-type work. A type with no
 * `imageField` simply renders text cards.
 */

interface ContentListGalleryProps {
  items: ListItem[];
  loading: boolean;
  config: ContentTypeConfig | null;
  selected: Set<string>;
  toggleSelect: (key: string) => void;
  onEdit: (contentType: string, id: string) => void;
}

export function ContentListGallery({
  items,
  loading,
  config,
  selected,
  toggleSelect,
  onEdit,
}: ContentListGalleryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-[220px] w-full rounded-container" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => {
        const key = `${item.contentType}:${item.id}`;
        const isSelected = selected.has(key);
        const statusColor = getStatusColor(item.status);
        // ListItem carries no image; derive it from the type's configured
        // imageField so this works for any type without widening the shape.
        const rawImage = config?.imageField
          ? (item.raw as Record<string, unknown> | undefined)?.[config.imageField]
          : undefined;
        const imageUrl = typeof rawImage === 'string' && rawImage ? rawImage : null;

        return (
          <div
            key={key}
            className={`relative border rounded-container overflow-hidden transition-colors hover:bg-muted/40 ${
              isSelected ? 'border-primary' : 'border-border'
            }`}
          >
            {/* Click target is an absolutely-positioned button SIBLING of the
                content, not a wrapper — the repo's card pattern. Wrapping would
                nest the checkbox inside an interactive element (axe
                nested-interactive) and lose keyboard support. */}
            <button
              type="button"
              aria-label={`Edit ${item.title}`}
              className="absolute inset-0 z-0 cursor-pointer"
              onClick={() => onEdit(item.contentType, item.id)}
            />

            {/* Above the overlay so selecting does not open the editor. */}
            <div className="absolute top-2 left-2 z-10">
              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(key)} />
            </div>

            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                imageRole="thumb"
                className="w-full h-[140px] object-cover"
              />
            ) : (
              <div className="w-full h-[140px] bg-muted flex items-center justify-center">
                {config?.icon ? (
                  <config.icon size={28} className="text-muted-foreground/50" />
                ) : null}
              </div>
            )}

            <div className="p-4 relative z-10 pointer-events-none">
              <p className="text-sm font-semibold leading-tight line-clamp-2">{item.title}</p>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {item.description}
                </p>
              )}
              {item.status && (
                <Badge
                  className="mt-2 h-5 text-xs2 font-semibold"
                  style={{ backgroundColor: getStatusTint(item.status), color: statusColor }}
                >
                  {getStatusLabel(item.status)}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
