import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useMediaDetail } from '@/hooks/useMediaDetail';
import { useMediaMutations } from '@/hooks/useMediaMutations';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Star,
  Trash2,
  ExternalLink,
  Copy,
  Zap,
  Flag,
  Loader2,
  Image as ImageIcon,
  X,
  Crown,
} from 'lucide-react';
import { getOptimizationStatusBadge, formatFileSize, entityTypeLabel, entityAdminPath, getImageUrl } from './utils';
import type { UnifiedMediaItem } from './types';

export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAdminRoles();
  const { data: detail, isLoading, error } = useMediaDetail(id);
  const mutations = useMediaMutations();

  const [altText, setAltText] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [license, setLicense] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [metaDirty, setMetaDirty] = useState(false);

  if (!isAdmin) {
    return (
      <div className="max-w-screen-lg mx-auto p-6">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-screen-lg mx-auto p-6">
        <Button variant="ghost" onClick={() => navigate('/admin/media')}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back to Media Library
        </Button>
        <p className="text-muted-foreground mt-4">Media item not found.</p>
      </div>
    );
  }

  const editAltText = altText ?? detail.alt_text ?? '';
  const editAttribution = attribution ?? detail.attribution ?? '';
  const editLicense = license ?? detail.license ?? '';

  const handleSaveMetadata = () => {
    mutations.updateMetadata.mutate({
      item: detail as UnifiedMediaItem,
      updates: {
        alt_text: editAltText,
        attribution: editAttribution,
        license: editLicense,
      },
    });
    setMetaDirty(false);
  };

  const handleDelete = () => {
    mutations.deleteItem.mutate(detail as UnifiedMediaItem, {
      onSuccess: () => navigate('/admin/media'),
    });
    setDeleteDialogOpen(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const imageUrl = getImageUrl(detail as UnifiedMediaItem);

  return (
    <div className="max-w-screen-lg mx-auto p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/media')}>
            <ArrowLeft style={{ height: 16, width: 16 }} />
          </Button>
          <div>
            <h4 className="text-xl font-bold">{detail.display_name}</h4>
            <p className="text-sm text-muted-foreground">
              {detail.source_type === 'image_asset' ? 'Image Asset' : 'CMS Media'}
              {detail.format && ` · ${detail.format.toUpperCase()}`}
              {detail.file_size ? ` · ${formatFileSize(detail.file_size)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutations.toggleStar.mutate(detail as UnifiedMediaItem)}
          >
            <Star style={{ height: 16, width: 16, fill: detail.starred ? 'currentColor' : 'none' }} />
          </Button>
          {imageUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
                Open
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={detail.usage_count > 0}
          >
            <Trash2 style={{ height: 14, width: 14, marginRight: 4 }} />
            Delete
          </Button>
        </div>
      </div>

      {/* Preview */}
      <Card>
        <CardContent className="p-0">
          {detail.mime_type.startsWith('image/') && imageUrl ? (
            <div className="relative bg-muted flex items-center justify-center" style={{ minHeight: 200, maxHeight: 500 }}>
              <img
                src={imageUrl}
                alt={detail.alt_text || detail.display_name}
                className="max-w-full max-h-[500px] object-contain"
              />
              {detail.is_flagged && (
                <Badge variant="destructive" className="absolute top-3 right-3">
                  <Flag style={{ height: 12, width: 12, marginRight: 4 }} />
                  Flagged{detail.flagged_reason && `: ${detail.flagged_reason}`}
                </Badge>
              )}
              {detail.width && detail.height && (
                <Badge variant="outline" className="absolute bottom-3 right-3 bg-background/80">
                  {detail.width} × {detail.height}
                </Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 bg-muted">
              <ImageIcon style={{ height: 48, width: 48 }} className="text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium mb-1">Alt Text</p>
              <Input
                value={editAltText}
                onChange={(e) => { setAltText(e.target.value); setMetaDirty(true); }}
                placeholder="Describe this image..."
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Attribution</p>
              <Input
                value={editAttribution}
                onChange={(e) => { setAttribution(e.target.value); setMetaDirty(true); }}
                placeholder="Photo by..."
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">License</p>
              <Select
                value={editLicense || 'none'}
                onValueChange={(v) => { setLicense(v === 'none' ? '' : v); setMetaDirty(true); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No license</SelectItem>
                  <SelectItem value="CC0">CC0 (Public Domain)</SelectItem>
                  <SelectItem value="CC-BY">CC BY</SelectItem>
                  <SelectItem value="CC-BY-SA">CC BY-SA</SelectItem>
                  <SelectItem value="CC-BY-NC">CC BY-NC</SelectItem>
                  <SelectItem value="all-rights-reserved">All Rights Reserved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {metaDirty && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveMetadata}
                disabled={mutations.updateMetadata.isPending}
              >
                {mutations.updateMetadata.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Usage ({detail.entity_links.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {detail.entity_links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not used by any entity.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.entity_links.map((link, i) => (
                  <TableRow key={`${link.entity_type}-${link.entity_id}-${link.role}-${i}`}>
                    <TableCell>
                      <Link
                        to={entityAdminPath(link.entity_type, link.entity_id)}
                        className="text-foreground underline hover:text-foreground/80"
                      >
                        {link.entity_name || link.entity_id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" style={{ fontSize: '0.625rem' }}>
                        {entityTypeLabel(link.entity_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" style={{ fontSize: '0.625rem' }}>
                        {link.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {detail.source_type === 'image_asset' && link.role !== 'cover' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mutations.setAsCover.mutate({
                              assetId: detail.id,
                              entityType: link.entity_type,
                              entityId: link.entity_id,
                            })}
                            title="Set as cover"
                          >
                            <Crown style={{ height: 14, width: 14 }} />
                          </Button>
                        )}
                        {detail.source_type === 'image_asset' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mutations.removeEntityLink.mutate({
                              assetId: detail.id,
                              entityType: link.entity_type,
                              entityId: link.entity_id,
                              role: link.role,
                            })}
                            title="Remove link"
                          >
                            <X style={{ height: 14, width: 14 }} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Optimization */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Optimization</CardTitle>
            {getOptimizationStatusBadge(detail.optimization_status)}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Original Size</p>
              <p className="font-medium">{formatFileSize(detail.file_size)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Format</p>
              <p className="font-medium">{detail.format?.toUpperCase() || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Dimensions</p>
              <p className="font-medium">
                {detail.width && detail.height ? `${detail.width} × ${detail.height}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Source</p>
              <p className="font-medium">{detail.source || '—'}</p>
            </div>
          </div>
          {detail.optimization_status === 'pending' && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => mutations.optimizeItem.mutate()}
              disabled={mutations.optimizeItem.isPending}
            >
              <Zap style={{ height: 14, width: 14, marginRight: 4 }} />
              {mutations.optimizeItem.isPending ? 'Optimizing...' : 'Optimize Now'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Technical */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Technical Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {detail.phash && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Perceptual Hash</span>
                  <span className="flex items-center gap-1 font-mono text-xs">
                    {detail.phash.slice(0, 16)}
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(detail.phash!)}>
                      <Copy style={{ height: 12, width: 12 }} />
                    </Button>
                  </span>
                </div>
              )}
              {detail.content_hash && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Content Hash</span>
                  <span className="flex items-center gap-1 font-mono text-xs">
                    {detail.content_hash.slice(0, 16)}
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(detail.content_hash!)}>
                      <Copy style={{ height: 12, width: 12 }} />
                    </Button>
                  </span>
                </div>
              )}
              {detail.url && (
                <div className="flex items-center justify-between md:col-span-2">
                  <span className="text-muted-foreground">URL</span>
                  <span className="flex items-center gap-1 font-mono text-xs max-w-md truncate">
                    {detail.url}
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(detail.url!)}>
                      <Copy style={{ height: 12, width: 12 }} />
                    </Button>
                  </span>
                </div>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-muted-foreground">Created</p>
                <p>{new Date(detail.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated</p>
                <p>{new Date(detail.updated_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source Type</p>
                <p>{detail.source_type}</p>
              </div>
              {detail.storage_path && (
                <div>
                  <p className="text-muted-foreground">Storage Path</p>
                  <p className="font-mono text-xs truncate">{detail.storage_path}</p>
                </div>
              )}
            </div>

            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <>
                <Separator />
                <ExifDataSection metadata={detail.metadata} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{detail.display_name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ExifField {
  label: string;
  value: string;
}

function ExifDataSection({ metadata }: { metadata: Record<string, unknown> }) {
  const exif = (metadata.exif || {}) as Record<string, unknown>;
  const hasExif = Object.keys(exif).length > 0;

  if (!hasExif) {
    return (
      <details>
        <summary className="text-muted-foreground cursor-pointer">Raw Metadata</summary>
        <pre className="mt-2 p-3 bg-muted text-xs overflow-auto max-h-48">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </details>
    );
  }

  const fields: ExifField[] = [];

  // Camera
  if (exif.make || exif.model) {
    const camera = [exif.make, exif.model].filter(Boolean).join(' ');
    fields.push({ label: 'Camera', value: camera });
  }
  if (exif.lensModel) fields.push({ label: 'Lens', value: String(exif.lensModel) });

  // Exposure
  if (exif.focalLength) {
    let fl = `${exif.focalLength}mm`;
    if (exif.focalLength35mm) fl += ` (${exif.focalLength35mm}mm equiv.)`;
    fields.push({ label: 'Focal Length', value: fl });
  }
  if (exif.fNumber) fields.push({ label: 'Aperture', value: `f/${exif.fNumber}` });
  if (exif.exposureTime) fields.push({ label: 'Shutter Speed', value: String(exif.exposureTime) });
  if (exif.iso) fields.push({ label: 'ISO', value: String(exif.iso) });

  // Date
  if (exif.dateTimeOriginal || exif.dateTime) {
    const dt = String(exif.dateTimeOriginal || exif.dateTime);
    const formatted = dt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    fields.push({ label: 'Date Taken', value: formatted });
  }

  // Technical
  if (exif.colorSpace) fields.push({ label: 'Color Space', value: String(exif.colorSpace) });
  if (exif.flash) fields.push({ label: 'Flash', value: String(exif.flash) });
  if (exif.meteringMode) fields.push({ label: 'Metering', value: String(exif.meteringMode) });
  if (exif.whiteBalance) fields.push({ label: 'White Balance', value: String(exif.whiteBalance) });
  if (exif.software) fields.push({ label: 'Software', value: String(exif.software) });

  // Rights
  if (exif.artist) fields.push({ label: 'Artist', value: String(exif.artist) });
  if (exif.copyright) fields.push({ label: 'Copyright', value: String(exif.copyright) });

  // GPS
  if (exif.gpsLatitude != null && exif.gpsLongitude != null) {
    fields.push({
      label: 'GPS',
      value: `${exif.gpsLatitude}, ${exif.gpsLongitude}${exif.gpsAltitude != null ? ` (${exif.gpsAltitude}m)` : ''}`,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground">EXIF Data</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="truncate" title={value}>{value}</span>
          </div>
        ))}
      </div>
      <details className="mt-1">
        <summary className="text-xs text-muted-foreground cursor-pointer">Raw EXIF JSON</summary>
        <pre className="mt-1 p-2 bg-muted text-xs overflow-auto max-h-36">
          {JSON.stringify(exif, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default MediaDetailPage;
