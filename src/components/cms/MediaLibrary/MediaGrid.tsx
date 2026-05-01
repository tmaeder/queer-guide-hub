import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  Trash2,
  Download,
  Eye,
  MoreVertical,
  Image as ImageIcon,
  RefreshCw,
  Settings,
  Zap,
  Star,
  ExternalLink,
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
        <Box sx={{ width: 32, height: 32, border: 2, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent style={{ paddingTop: 48, paddingBottom: 48, textAlign: 'center' }}>
          <ImageIcon style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>No Media Found</Typography>
          <Typography variant="body2" color="text.secondary">
            {searchQuery || hasFilter
              ? 'Try adjusting your search or filters'
              : 'Upload your first media file to get started'
            }
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'grid') {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
        {items.map((item) => (
          <Card key={item.id} style={{ overflow: 'hidden', position: 'relative' }}>
            {bulkMode && (
              <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={() => onToggleSelect(item.id)}
                  style={{ backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
              </Box>
            )}

            <Box sx={{ aspectRatio: '1/1', position: 'relative' }}>
              {item.mime_type.startsWith('image/') ? (
                <Box
                  component="img"
                  src={getImageUrl(item)}
                  alt={item.original_filename}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
              ) : (
                <Box sx={{ width: '100%', height: '100%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {getFileIcon(item.mime_type)}
                </Box>
              )}

              <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
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
              </Box>

              <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.5)', opacity: 0, '&:hover': { opacity: 1 }, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
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
                    <DropdownMenuItem onClick={() => onDownload(item)}>
                      <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(item)}
                      style={{ color: '#dc2626' }}
                    >
                      <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Box>
            </Box>

            <CardContent style={{ padding: 12 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mb: 1 }}>{item.original_filename}</Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">{formatFileSize(item.file_size)}</Typography>
                  <Badge variant={item.usage_count ? 'default' : 'secondary'} style={{ fontSize: '0.75rem' }}>
                    {item.usage_count || 0}
                  </Badge>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {getOptimizationStatusBadge(item.optimization_status)}
                  {item.width && item.height && (
                    <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                      {item.width}x{item.height}
                    </Badge>
                  )}
                </Box>

                {item.formats_available && item.formats_available.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {item.formats_available.map((format, idx) => (
                      <Badge key={idx} variant="secondary" style={{ fontSize: '10px', padding: '0 4px' }}>
                        {format}
                      </Badge>
                    ))}
                  </Box>
                )}

                {item.optimization_metadata?.compression_ratio && (
                  <Typography variant="caption" sx={{ color: 'success.main' }}>
                    {item.optimization_metadata.compression_ratio}% smaller
                  </Typography>
                )}

                {item.optimization_metadata?.formats && item.optimization_metadata.formats.length > 1 && (
                  <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Optimized versions:</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {item.optimization_metadata.formats.map((formatInfo, idx) => (
                        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box
                            component="a"
                            href={`${getImageUrl(item).split('.')[0]}.${formatInfo.format.toLowerCase()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.625rem' }}
                          >
                            <ExternalLink style={{ height: 8, width: 8 }} />
                            {formatInfo.format}
                          </Box>
                          <Typography sx={{ fontSize: '0.625rem' }} color="text.secondary">
                            {formatFileSize(formatInfo.size)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  if (viewMode === 'list') {
    return (
      <Card>
        <CardContent style={{ padding: 0 }}>
          <Box sx={{ '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
            {items.map((item) => (
              <Box key={item.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                {bulkMode && (
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={() => onToggleSelect(item.id)}
                  />
                )}

                <Box sx={{ width: 64, height: 64, borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover', flexShrink: 0 }}>
                  {item.mime_type.startsWith('image/') ? (
                    <Box
                      component="img"
                      src={getImageUrl(item)}
                      alt={item.original_filename}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getFileIcon(item.mime_type)}
                    </Box>
                  )}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.original_filename}</Typography>
                    {item.starred && <Star style={{ height: 16, width: 16, fill: 'currentColor', color: '#eab308' }} />}
                    {getOptimizationStatusBadge(item.optimization_status)}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">{formatFileSize(item.file_size)}</Typography>
                    <Typography variant="body2" color="text.secondary">{new Date(item.created_at).toLocaleDateString()}</Typography>
                    {item.width && item.height && (
                      <Typography variant="body2" color="text.secondary">{item.width} x {item.height}</Typography>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    {item.formats_available && item.formats_available.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Formats:</Typography>
                        {item.formats_available.map((format, idx) => (
                          <Badge key={idx} variant="secondary" style={{ fontSize: '0.75rem', padding: '0 4px' }}>
                            {format}
                          </Badge>
                        ))}
                      </Box>
                    )}
                    {item.optimization_metadata?.compression_ratio && (
                      <Badge variant="outline" style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                        -{item.optimization_metadata.compression_ratio}%
                      </Badge>
                    )}
                  </Box>

                  {item.optimization_metadata?.formats && item.optimization_metadata.formats.length > 1 && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Optimized versions:</Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {item.optimization_metadata.formats.map((formatInfo, idx) => (
                          <Box
                            key={idx}
                            component="a"
                            href={`${getImageUrl(item).split('.')[0]}.${formatInfo.format.toLowerCase()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5 }}
                          >
                            <ExternalLink style={{ height: 12, width: 12 }} />
                            {formatInfo.format} ({formatFileSize(formatInfo.size)})
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                      <DropdownMenuItem onClick={() => onDownload(item)}>
                        <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(item)}
                        style={{ color: '#dc2626' }}
                      >
                        <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Box>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  }

  // compact
  return (
    <Card>
      <CardContent style={{ padding: 16 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {items.map((item) => (
            <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1 }}>
              {bulkMode && (
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={() => onToggleSelect(item.id)}
                />
              )}

              {getFileIcon(item.mime_type)}

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.original_filename}</Typography>
                  {item.starred && <Star style={{ height: 12, width: 12, fill: 'currentColor', color: '#eab308' }} />}
                  {getOptimizationStatusBadge(item.optimization_status)}
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary">
                {formatFileSize(item.file_size)}
              </Typography>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical style={{ height: 12, width: 12 }} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onSingleOptimize(item)}>
                    <Zap style={{ height: 16, width: 16, marginRight: 8 }} />
                    Optimize
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDownload(item)}>
                    <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(item)}
                    style={{ color: '#dc2626' }}
                  >
                    <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
