import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Card>
                  <CardHeader>
                    <CardTitle style={{ fontSize: '1.125rem' }}>Quality & Compression</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                          Quality: {settings.quality}%
                        </Typography>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={settings.quality}
                          onChange={(e) => update({ quality: parseInt(e.target.value) })}
                          style={{ width: '100%' }}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">Smaller file</Typography>
                          <Typography variant="caption" color="text.secondary">Better quality</Typography>
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Output Formats</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {['WEBP', 'AVIF', 'JPEG', 'PNG'].map(format => (
                            <Box key={format} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                              <Typography variant="body2">{format}</Typography>
                              {format === 'WEBP' && <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>Recommended</Badge>}
                              {format === 'AVIF' && <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>Best compression</Badge>}
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle style={{ fontSize: '1.125rem' }}>Resize Options</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          checked={settings.resize}
                          onCheckedChange={(checked) => update({ resize: !!checked })}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Enable resizing</Typography>
                      </Box>

                      {settings.resize && (
                        <>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Max Width (px)</Typography>
                            <Input
                              type="number"
                              value={settings.maxWidth}
                              onChange={(e) => update({ maxWidth: parseInt(e.target.value) || 1920 })}
                              placeholder="1920"
                            />
                          </Box>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Max Height (px)</Typography>
                            <Input
                              type="number"
                              value={settings.maxHeight}
                              onChange={(e) => update({ maxHeight: parseInt(e.target.value) || 1080 })}
                              placeholder="1080"
                            />
                          </Box>
                        </>
                      )}

                      <Typography variant="caption" color="text.secondary">
                        Images will be resized proportionally to fit within these dimensions
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            </Box>
          </TabsContent>

          <TabsContent value="preview">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Optimization Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography sx={{ fontWeight: 500 }}>Estimated Results</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">Quality Level:</Typography>
                          <Typography variant="body2" sx={{
                            color: settings.quality >= 90 ? 'success.main' :
                              settings.quality >= 70 ? 'warning.main' : 'error.main'
                          }}>
                            {settings.quality >= 90 ? 'Excellent' :
                              settings.quality >= 70 ? 'Good' : 'Compressed'}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">Est. Size Reduction:</Typography>
                          <Typography variant="body2" sx={{ color: 'success.main' }}>
                            {100 - settings.quality}% - {100 - Math.floor(settings.quality * 0.8)}%
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">Output Formats:</Typography>
                          <Typography variant="body2">{settings.formats.length} format(s)</Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography sx={{ fontWeight: 500 }}>Format Benefits</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {settings.formats.includes('WEBP') && (
                          <Typography variant="caption" sx={{ color: 'success.main' }}>WebP: Up to 35% smaller than JPEG</Typography>
                        )}
                        {settings.formats.includes('AVIF') && (
                          <Typography variant="caption" sx={{ color: 'success.main' }}>AVIF: Up to 50% smaller than JPEG</Typography>
                        )}
                        {settings.formats.includes('JPEG') && (
                          <Typography variant="caption" sx={{ color: 'info.main' }}>JPEG: Universal compatibility</Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>

          <TabsContent value="advanced">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Options</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            checked={settings.preserveMetadata}
                            onCheckedChange={(checked) => update({ preserveMetadata: !!checked })}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Preserve Metadata</Typography>
                            <Typography variant="caption" color="text.secondary">Keep EXIF data, copyright info</Typography>
                          </Box>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            checked={settings.enableProgressiveJpeg}
                            onCheckedChange={(checked) => update({ enableProgressiveJpeg: !!checked })}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Progressive JPEG</Typography>
                            <Typography variant="caption" color="text.secondary">Better loading experience</Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            checked={settings.enableLosslessWebP}
                            onCheckedChange={(checked) => update({ enableLosslessWebP: !!checked })}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Lossless WebP</Typography>
                            <Typography variant="caption" color="text.secondary">No quality loss</Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>
        </Tabs>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2, borderTop: 1, borderColor: 'divider' }}>
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
        </Box>
      </DialogContent>
    </Dialog>
  );
}
