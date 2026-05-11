import { useNavigate } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Star,
  Flag,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import type { UnifiedMediaItem, ViewMode } from './types';
import { formatFileSize, getFileIcon, getOptimizationIcon, getThumbnailUrl } from './utils';

interface MediaGridProps {
  loading: boolean;
  items: UnifiedMediaItem[];
  viewMode: ViewMode;
  bulkMode: boolean;
  selectedItems: Set<string>;
  onToggleSelect: (id: string) => void;
  onStar: (item: UnifiedMediaItem) => void;
}

export function MediaGrid(props: MediaGridProps) {
  const { loading, items, viewMode, bulkMode, selectedItems, onToggleSelect, onStar } = props;
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border border-border p-12 text-center">
        <ImageIcon style={{ height: 48, width: 48, margin: '0 auto 16px' }} className="text-muted-foreground" />
        <p className="text-muted-foreground">No media found.</p>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {items.map((item) => (
          <Card
            key={item.id}
            className="cursor-pointer group overflow-hidden"
            onClick={() => navigate(`/admin/media/${item.id}`)}
          >
            {bulkMode && (
              <div className="absolute top-2 left-2 z-10" onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={() => onToggleSelect(item.id)}
                />
              </div>
            )}

            <div className="relative aspect-square bg-muted">
              {item.mime_type.startsWith('image/') ? (
                <img
                  src={getThumbnailUrl(item)}
                  alt={item.display_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {getFileIcon(item.mime_type, 24)}
                </div>
              )}

              {/* Status indicators */}
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                {item.is_flagged && (
                  <Flag style={{ height: 12, width: 12 }} />
                )}
                {getOptimizationIcon(item.optimization_status)}
              </div>

              {/* Hover overlay with star */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  style={{ color: 'white' }}
                  onClick={(e) => { e.stopPropagation(); onStar(item); }}
                >
                  <Star style={{ height: 14, width: 14, fill: item.starred ? 'currentColor' : 'none' }} />
                </Button>
                {item.usage_count > 0 && (
                  <Badge variant="secondary" style={{ fontSize: '0.625rem' }}>
                    {item.usage_count} use{item.usage_count !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>

            <CardContent className="p-2">
              <p className="text-xs truncate">{item.display_name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(item.file_size)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // List view
  return (
    <div className="border border-border divide-y divide-border">
      {items.map((item) => (
        <div
          key={item.id}
          className="p-3 flex items-center gap-3 hover:bg-muted cursor-pointer"
          onClick={() => navigate(`/admin/media/${item.id}`)}
        >
          {bulkMode && (
            <div onClick={e => e.stopPropagation()}>
              <Checkbox
                checked={selectedItems.has(item.id)}
                onCheckedChange={() => onToggleSelect(item.id)}
              />
            </div>
          )}

          <div className="w-12 h-12 bg-muted flex-shrink-0 overflow-hidden">
            {item.mime_type.startsWith('image/') ? (
              <img
                src={getThumbnailUrl(item)}
                alt={item.display_name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {getFileIcon(item.mime_type)}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm truncate">{item.display_name}</p>
              {item.starred && <Star style={{ height: 12, width: 12, fill: 'currentColor' }} />}
              {item.is_flagged && <Flag style={{ height: 12, width: 12 }} />}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{formatFileSize(item.file_size)}</span>
              {item.width && item.height && <span>{item.width}×{item.height}</span>}
              <span>{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {item.usage_count > 0 && (
              <Badge variant="secondary" style={{ fontSize: '0.625rem' }}>
                {item.usage_count}
              </Badge>
            )}
            {getOptimizationIcon(item.optimization_status)}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => { e.stopPropagation(); onStar(item); }}
            >
              <Star style={{ height: 14, width: 14, fill: item.starred ? 'currentColor' : 'none' }} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
