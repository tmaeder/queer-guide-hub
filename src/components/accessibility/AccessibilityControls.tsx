import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccessibility } from '@/hooks/useAccessibility';
import { RefreshCw, Eye, Volume2, Keyboard, MousePointer, Palette } from 'lucide-react';

export function AccessibilityControls() {
  const { settings, updateSetting, resetToDefaults } = useAccessibility();

  return (
    <div className="flex flex-col gap-6">
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
          <div className="flex flex-col gap-2">
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
          </div>
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
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Label htmlFor="high-contrast">High Contrast Mode</Label>
              <p className="text-sm text-muted-foreground">
                Increases contrast for better visibility
              </p>
            </div>
            <Switch
              id="high-contrast"
              checked={settings.highContrast}
              onCheckedChange={(checked) => updateSetting('highContrast', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Label htmlFor="focus-indicators">Enhanced Focus Indicators</Label>
              <p className="text-sm text-muted-foreground">
                More visible focus outlines for keyboard navigation
              </p>
            </div>
            <Switch
              id="focus-indicators"
              checked={settings.focusIndicators}
              onCheckedChange={(checked) => updateSetting('focusIndicators', checked)}
            />
          </div>
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
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Label htmlFor="reduce-motion">Reduce Motion</Label>
              <p className="text-sm text-muted-foreground">
                Minimizes animations that may cause discomfort
              </p>
            </div>
            <Switch
              id="reduce-motion"
              checked={settings.reduceMotion}
              onCheckedChange={(checked) => updateSetting('reduceMotion', checked)}
            />
          </div>
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
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Label htmlFor="screen-reader">Screen Reader Optimized</Label>
              <p className="text-sm text-muted-foreground">
                Enhances compatibility with screen reading software
              </p>
            </div>
            <Switch
              id="screen-reader"
              checked={settings.screenReaderOptimized}
              onCheckedChange={(checked) => updateSetting('screenReaderOptimized', checked)}
            />
          </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <strong>Tab:</strong> Navigate forward
            </div>
            <div>
              <strong>Shift + Tab:</strong> Navigate backward
            </div>
            <div>
              <strong>Enter/Space:</strong> Activate buttons
            </div>
            <div>
              <strong>Escape:</strong> Close dialogs/menus
            </div>
            <div>
              <strong>Arrow keys:</strong> Navigate lists/menus
            </div>
            <div>
              <strong>Home/End:</strong> Go to first/last item
            </div>
          </div>
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
    </div>
  );
}
