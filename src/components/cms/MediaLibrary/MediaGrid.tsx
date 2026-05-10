import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Trash2,
  Eye,
  MoreVertical,
  Image as ImageIcon,
  RefreshCw,
  Settings,
  Zap,
  Star,
  ExternalLink,
  Loader2,
  Flag,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MediaItem, ViewMode } from './types';
import { formatFileSize, getFileIcon, getOptimizationStatusBadge, getImageUrl } from './utils';

interface MediaGridProps {
  loading: boolean;
  items: MediaItem[];
  viewMode: ViewMode;
  bulkMode: boolean;
  selectedItems: Set<string>;
  optimizingItem: MediaItem | null;
  searchQuery: string;
  hasFilter: boolean;
  onToggleSelect: (id: string) => void;
  onStar: (item: MediaItem) => void;
  onSingleOptimize: (item: MediaItem) => void;
  onOptimizeWithSettings: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}

export function MediaGrid(props: MediaGridProps) {
  const {
    loading,
    items,
    viewMode,
    bulkMode,
    selectedItems,
    optimizingItem,
    searchQuery,
    hasFilter,
    onToggleSelect,
    onStar,
    onSingleOptimize,
    onOptimizeWithSettings,
    onDownload,
    onDelete,
  } = props;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent style={{ paddingTop: 48, paddingBottom: 48, textAlign: 'center' }}>
          <ImageIcon style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
          <h6 className="font-medium mb-2 text-lg">No Media Found</h6>
          <p className="text-sm text-muted-foreground">
            {searchQuery || hasFilter
              ? 'Try adjusting your search or filters'
              : 'Upload your first media file to get started'
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {items.map((item) => (
          <Card key={item.id} style={{ overflow: 'hidden', position: 'relative' }}>
            {bulkMode && (
              <div className="absolute top-2 left-2 z-10">
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={() => onToggleSelect(item.id)}
                  style={{ backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
              </div>
            )}

            <div className="relative aspect-square">
              {item.mime_type.startsWith('image/') ? (
                <img
                  src={getImageUrl(item)}
                  alt={item.original_filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.classList.add('bg-muted', 'flex', 'items-center', 'justify-center'); }}
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  {getFileIcon(item.mime_type)}
                </div>
              )}

              <div className="absolute top-2 right-2 flex gap-1">
                {item.is_flagged && (
                  <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Flag style={{ height: 12, width: 12, color: '#dc2626' }} />
                  </Badge>
                )}
                {item.starred && (
                  <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Star style={{ height: 12, width: 12, color: '#ca8a04', fill: 'currentColor' }} />
                  </Badge>
                )}
                {item.optimization_status === 'optimized' && (
                  <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap style={{ height: 12, width: 12, color: '#16a34a' }} />
                  </Badge>
                )}
                {item.optimization_status === 'processing' && (
                  <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw style={{ height: 12, width: 12, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                  </Badge>
                )}
                {optimizingItem?.id === item.id && (
                  <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw style={{ height: 12, width: 12, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                  </Badge>
                )}
              </div>

              <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button size="sm" variant="ghost" style={{ color: 'white' }}>
                  <Eye style={{ height: 16, width: 16 }} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" style={{ color: 'white' }}>
                      <MoreVertical style={{ height: 16, width: 16 }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {!item.external_url && (
                      <>
                        <DropdownMenuItem onClick={() => onStar(item)}>
                          <Star style={{ height: 16, width: 16, marginRight: 8 }} />
                          {item.starred ? 'Unstar' : 'Star'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onSingleOptimize(item)}>
                          <Zap style={{ height: 16, width: 16, marginRight: 8 }} />
                          {optimizingItem?.id === item.id ? 'Optimizing...' : 'Optimize'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOptimizeWithSettings(item)}>
                          <Settings style={{ height: 16, width: 16, marginRight: 8 }} />
                          Optimize with Settings
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem onClick={() => onDownload(item)}>
                      <ExternalLink style={{ height: 16, width: 16, marginRight: 8 }} />
                      {item.external_url ? 'Open in New Tab' : 'Download'}
                    </DropdownMenuItem>
                    {!item.external_url && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(item)}
                          style={{ color: '#dc2626' }}
                        >
                          <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <CardContent style={{ padding: 12 }}>
              <p className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap mb-2">{item.original_filename}</p>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{item.file_size ? formatFileSize(item.file_size) : '—'}</span>
                  <Badge variant={item.usage_count ? 'default' : 'secondary'} style={{ fontSize: '0.75rem' }}>
                    {item.usage_count || 0}
                  </Badge>
                </div>

                {item.entity_types && item.entity_types.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.entity_types.map(et => (
                      <Badge key={et} variant="outline" style={{ fontSize: '10px', padding: '0 4px' }}>
                        {et.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  {getOptimizationStatusBadge(item.optimization_status)}
                  {item.width && item.height && (
                    <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                      {item.width}x{item.height}
                    </Badge>
                  )}
                </div>

                {item.formats_available && item.formats_available.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.formats_available.map((format, idx) => (
                      <Badge key={idx} variant="secondary" style={{ fontSize: '10px', padding: '0 4px' }}>
                        {format}
                      </Badge>
                    ))}
                  </div>
                )}

                {item.optimization_metadata?.compression_ratio && (
                  <span className="text-xs text-green-600">
                    {item.optimization_metadata.compression_ratio}% smaller
                  </span>
                )}

                {item.optimization_metadata?.formats && item.optimization_metadata.formats.length > 1 && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Optimized versions:</p>
                    <div className="flex flex-col gap-1">
                      {item.optimization_metadata.formats.map((formatInfo, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <a
                            href={`${getImageUrl(item).split('.')[0]}.${formatInfo.format.toLowerCase()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary no-underline hover:underline flex items-center gap-1"
                            style={{ fontSize: '0.625rem' }}
                          >
                            <ExternalLink style={{ height: 8, width: 8 }} />
                            {formatInfo.format}
                          </a>
                          <span className="text-muted-foreground" style={{ fontSize: '0.625rem' }}>
                            {formatFileSize(formatInfo.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <Card>
        <CardContent style={{ padding: 0 }}>
          <div className="[&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border">
            {items.map((item) => (
              <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-muted">
                {bulkMode && (
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={() => onToggleSelect(item.id)}
                  />
                )}

                <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  {item.mime_type.startsWith('image/') ? (
                    <img
                      src={getImageUrl(item)}
                      alt={item.original_filename}
                      className="w-full h-full object-cover"
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
                    <p className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">{item.original_filename}</p>
                    {item.starred && <Star style={{ height: 16, width: 16, fill: 'currentColor', color: '#eab308' }} />}
                    {getOptimizationStatusBadge(item.optimization_status)}
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-sm text-muted-foreground">{formatFileSize(item.file_size)}</span>
                    <span className="text-sm text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
                    {item.width && item.height && (
                      <span className="text-sm text-muted-foreground">{item.width} x {item.height}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    {item.formats_available && item.formats_available.length > 0 && (
                      <div className="flex gap-1">
                        <span className="text-xs text-muted-foreground">Formats:</span>
                        {item.formats_available.map((format, idx) => (
                          <Badge key={idx} variant="secondary" style={{ fontSize: '0.75rem', padding: '0 4px' }}>
                            {format}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {item.optimization_metadata?.compression_ratio && (
                      <Badge variant="outline" style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                        -{item.optimization_metadata.compression_ratio}%
                      </Badge>
                    )}
                  </div>

                  {item.optimization_metadata?.formats && item.optimization_metadata.formats.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Optimized versions:</p>
                      <div className="flex gap-2 flex-wrap">
                        {item.optimization_metadata.formats.map((formatInfo, idx) => (
                          <a
                            key={idx}
                            href={`${getImageUrl(item).split('.')[0]}.${formatInfo.format.toLowerCase()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary no-underline hover:underline text-xs flex items-center gap-1"
                          >
                            <ExternalLink style={{ height: 12, width: 12 }} />
                            {formatInfo.format} ({formatFileSize(formatInfo.size)})
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={item.usage_count ? 'default' : 'secondary'}>
                    {item.usage_count || 0}
                  </Badge>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical style={{ height: 16, width: 16 }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {!item.external_url && (
                        <>
                          <DropdownMenuItem onClick={() => onStar(item)}>
                            <Star style={{ height: 16, width: 16, marginRight: 8 }} />
                            {item.starred ? 'Unstar' : 'Star'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onSingleOptimize(item)}>
                            <Zap style={{ height: 16, width: 16, marginRight: 8 }} />
                            {optimizingItem?.id === item.id ? 'Optimizing...' : 'Quick Optimize'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onOptimizeWithSettings(item)}>
                            <Settings style={{ height: 16, width: 16, marginRight: 8 }} />
                            Optimize with Settings
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem onClick={() => onDownload(item)}>
                        <ExternalLink style={{ height: 16, width: 16, marginRight: 8 }} />
                        {item.external_url ? 'Open in New Tab' : 'Download'}
                      </DropdownMenuItem>
                      {!item.external_url && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(item)}
                            style={{ color: '#dc2626' }}
                          >
                            <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // compact
  return (
    <Card>
      <CardContent style={{ padding: 16 }}>
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded-md">
              {bulkMode && (
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={() => onToggleSelect(item.id)}
                />
              )}

              {getFileIcon(item.mime_type)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm overflow-hidden text-ellipsis whitespace-nowrap">{item.original_filename}</p>
                  {item.starred && <Star style={{ height: 12, width: 12, fill: 'currentColor', color: '#eab308' }} />}
                  {getOptimizationStatusBadge(item.optimization_status)}
                </div>
              </div>

              <span className="text-xs text-muted-foreground">
                {formatFileSize(item.file_size)}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical style={{ height: 12, width: 12 }} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {!item.external_url && (
                    <DropdownMenuItem onClick={() => onSingleOptimize(item)}>
                      <Zap style={{ height: 16, width: 16, marginRight: 8 }} />
                      Optimize
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onDownload(item)}>
                    <ExternalLink style={{ height: 16, width: 16, marginRight: 8 }} />
                    {item.external_url ? 'Open in New Tab' : 'Download'}
                  </DropdownMenuItem>
                  {!item.external_url && (
                    <DropdownMenuItem
                      onClick={() => onDelete(item)}
                      style={{ color: '#dc2626' }}
                    >
                      <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
