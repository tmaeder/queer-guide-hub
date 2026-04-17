import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccessibility } from '@/hooks/useAccessibility';
import { RefreshCw, Eye, Volume2, Keyboard, MousePointer, Palette } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function AccessibilityControls() {
  const { settings, updateSetting, resetToDefaults } = useAccessibility();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Font Size Control */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Eye style={{ height: 20, width: 20 }} />
            Text Size
          </CardTitle>
          <CardDescription>
            Adjust the text size throughout the application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor="font-size">Font Size</Label>
            <Select
              value={settings.fontSize}
              onValueChange={(value) => updateSetting('fontSize', value as 'small' | 'medium' | 'large' | 'extra-large')}
            >
              <SelectTrigger id="font-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium (Default)</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="extra-large">Extra Large</SelectItem>
              </SelectContent>
            </Select>
          </Box>
        </CardContent>
      </Card>

      {/* Visual Settings */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Palette style={{ height: 20, width: 20 }} />
            Visual Settings
          </CardTitle>
          <CardDescription>
            Customize visual appearance for better accessibility
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Label htmlFor="high-contrast">High Contrast Mode</Label>
              <Typography variant="body2" color="text.secondary">
                Increases contrast for better visibility
              </Typography>
            </Box>
            <Switch
              id="high-contrast"
              checked={settings.highContrast}
              onCheckedChange={(checked) => updateSetting('highContrast', checked)}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Label htmlFor="focus-indicators">Enhanced Focus Indicators</Label>
              <Typography variant="body2" color="text.secondary">
                More visible focus outlines for keyboard navigation
              </Typography>
            </Box>
            <Switch
              id="focus-indicators"
              checked={settings.focusIndicators}
              onCheckedChange={(checked) => updateSetting('focusIndicators', checked)}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Motion Settings */}
      <Card>
        <CardHeader>
          <CardTitle>
            <MousePointer style={{ height: 20, width: 20 }} />
            Motion & Animation
          </CardTitle>
          <CardDescription>
            Control animations and motion effects
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Label htmlFor="reduce-motion">Reduce Motion</Label>
              <Typography variant="body2" color="text.secondary">
                Minimizes animations that may cause discomfort
              </Typography>
            </Box>
            <Switch
              id="reduce-motion"
              checked={settings.reduceMotion}
              onCheckedChange={(checked) => updateSetting('reduceMotion', checked)}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Screen Reader Settings */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Volume2 style={{ height: 20, width: 20 }} />
            Screen Reader Support
          </CardTitle>
          <CardDescription>
            Optimize the interface for screen readers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Label htmlFor="screen-reader">Screen Reader Optimized</Label>
              <Typography variant="body2" color="text.secondary">
                Enhances compatibility with screen reading software
              </Typography>
            </Box>
            <Switch
              id="screen-reader"
              checked={settings.screenReaderOptimized}
              onCheckedChange={(checked) => updateSetting('screenReaderOptimized', checked)}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Keyboard Navigation Info */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Keyboard style={{ height: 20, width: 20 }} />
            Keyboard Navigation
          </CardTitle>
          <CardDescription>
            Learn about keyboard shortcuts and navigation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, fontSize: '0.875rem' }}>
            <Box>
              <strong>Tab:</strong> Navigate forward
            </Box>
            <Box>
              <strong>Shift + Tab:</strong> Navigate backward
            </Box>
            <Box>
              <strong>Enter/Space:</strong> Activate buttons
            </Box>
            <Box>
              <strong>Escape:</strong> Close dialogs/menus
            </Box>
            <Box>
              <strong>Arrow keys:</strong> Navigate lists/menus
            </Box>
            <Box>
              <strong>Home/End:</strong> Go to first/last item
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <Card>
        <CardHeader>
          <CardTitle>Reset Settings</CardTitle>
          <CardDescription>
            Restore all accessibility settings to their default values
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={resetToDefaults}

          >
            <RefreshCw style={{ height: 16, width: 16 }} />
            Reset to Defaults
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
