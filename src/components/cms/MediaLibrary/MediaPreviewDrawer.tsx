import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Zap } from 'lucide-react';
import type { OptimizationSettings } from './types';

interface MediaPreviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  settings: OptimizationSettings;
  onSettingsChange: (next: OptimizationSettings) => void;
  onOptimize: () => void;
}

export function MediaPreviewDrawer({
  open,
  onOpenChange,
  selectedCount,
  settings,
  onSettingsChange,
  onOptimize,
}: MediaPreviewDrawerProps) {
  const update = (patch: Partial<OptimizationSettings>) => onSettingsChange({ ...settings, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>
            {selectedCount > 0
              ? `Optimize ${selectedCount} Selected Files`
              : 'Image Optimization Settings'
            }
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="settings" style={{ width: '100%' }}>
          <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr 1fr' }}>
            <TabsTrigger value="settings">Optimization Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview & Quality</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Options</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle style={{ fontSize: '1.125rem' }}>Quality & Compression</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Quality: {settings.quality}%</p>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={settings.quality}
                          onChange={(e) => update({ quality: parseInt(e.target.value) })}
                          style={{ width: '100%' }}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-muted-foreground">Smaller file</span>
                          <span className="text-xs text-muted-foreground">Better quality</span>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-2">Output Formats</p>
                        <div className="flex flex-col gap-2">
                          {['WEBP', 'AVIF', 'JPEG', 'PNG'].map(format => (
                            <div key={format} className="flex items-center gap-2">
                              <Checkbox
                                checked={settings.formats.includes(format)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    update({ formats: [...settings.formats, format] });
                                  } else {
                                    update({ formats: settings.formats.filter(f => f !== format) });
                                  }
                                }}
                              />
                              <span className="text-sm">{format}</span>
                              {format === 'WEBP' && <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>Recommended</Badge>}
                              {format === 'AVIF' && <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>Best compression</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle style={{ fontSize: '1.125rem' }}>Resize Options</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={settings.resize}
                          onCheckedChange={(checked) => update({ resize: !!checked })}
                        />
                        <span className="text-sm font-medium">Enable resizing</span>
                      </div>

                      {settings.resize && (
                        <>
                          <div>
                            <p className="text-sm font-medium">Max Width (px)</p>
                            <Input
                              type="number"
                              value={settings.maxWidth}
                              onChange={(e) => update({ maxWidth: parseInt(e.target.value) || 1920 })}
                              placeholder="1920"
                            />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Max Height (px)</p>
                            <Input
                              type="number"
                              value={settings.maxHeight}
                              onChange={(e) => update({ maxHeight: parseInt(e.target.value) || 1080 })}
                              placeholder="1080"
                            />
                          </div>
                        </>
                      )}

                      <span className="text-xs text-muted-foreground">
                        Images will be resized proportionally to fit within these dimensions
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview">
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Optimization Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <p className="font-medium">Estimated Results</p>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between">
                          <span className="text-sm">Quality Level:</span>
                          <span
                            className="text-sm"
                            style={{
                              color:
                                settings.quality >= 90
                                  ? 'hsl(var(--success, 142 76% 36%))'
                                  : settings.quality >= 70
                                  ? 'hsl(var(--warning, 38 92% 50%))'
                                  : 'hsl(var(--destructive))',
                            }}
                          >
                            {settings.quality >= 90 ? 'Excellent' :
                              settings.quality >= 70 ? 'Good' : 'Compressed'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Est. Size Reduction:</span>
                          <span className="text-sm" style={{ color: 'hsl(142 76% 36%)' }}>
                            {100 - settings.quality}% - {100 - Math.floor(settings.quality * 0.8)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Output Formats:</span>
                          <span className="text-sm">{settings.formats.length} format(s)</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <p className="font-medium">Format Benefits</p>
                      <div className="flex flex-col gap-1">
                        {settings.formats.includes('WEBP') && (
                          <span className="text-xs" style={{ color: 'hsl(142 76% 36%)' }}>WebP: Up to 35% smaller than JPEG</span>
                        )}
                        {settings.formats.includes('AVIF') && (
                          <span className="text-xs" style={{ color: 'hsl(142 76% 36%)' }}>AVIF: Up to 50% smaller than JPEG</span>
                        )}
                        {settings.formats.includes('JPEG') && (
                          <span className="text-xs" style={{ color: 'hsl(217 91% 60%)' }}>JPEG: Universal compatibility</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="advanced">
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Options</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={settings.preserveMetadata}
                            onCheckedChange={(checked) => update({ preserveMetadata: !!checked })}
                          />
                          <div>
                            <p className="text-sm font-medium">Preserve Metadata</p>
                            <span className="text-xs text-muted-foreground">Keep EXIF data, copyright info</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={settings.enableProgressiveJpeg}
                            onCheckedChange={(checked) => update({ enableProgressiveJpeg: !!checked })}
                          />
                          <div>
                            <p className="text-sm font-medium">Progressive JPEG</p>
                            <span className="text-xs text-muted-foreground">Better loading experience</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={settings.enableLosslessWebP}
                            onCheckedChange={(checked) => update({ enableLosslessWebP: !!checked })}
                          />
                          <div>
                            <p className="text-sm font-medium">Lossless WebP</p>
                            <span className="text-xs text-muted-foreground">No quality loss</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onOptimize}
            disabled={selectedCount === 0 || settings.formats.length === 0}
          >
            <Zap style={{ height: 16, width: 16, marginRight: 4 }} />
            Optimize {selectedCount} Files
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
