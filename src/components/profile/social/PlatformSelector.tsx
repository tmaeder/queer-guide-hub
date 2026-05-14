import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus } from 'lucide-react';
import { PLATFORM_CONFIGS, PlatformConfig } from './platformConfigs';

interface PlatformSelectorProps {
  onPlatformSelect: (platform: string, url: string) => void;
}

export function PlatformSelector({ onPlatformSelect }: PlatformSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customUrl, setCustomUrl] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const categories = ['all', ...new Set(PLATFORM_CONFIGS.map((p) => p.category))];

  const filteredPlatforms = PLATFORM_CONFIGS.filter((platform) => {
    const matchesSearch = platform.platform.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || platform.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleQuickAdd = (platform: PlatformConfig) => {
    const placeholder = platform.platform === 'Website' ? 'https://yourwebsite.com' : 'username';
    onPlatformSelect(platform.platform, placeholder);
  };

  const handleCustomAdd = () => {
    if (customUrl.trim()) {
      const detectedPlatform = PLATFORM_CONFIGS.find((p) => {
        try {
          const regex = new RegExp(p.urlDetectionRegex.replace(/^\(\?i\)/, ''), 'i');
          return regex.test(customUrl);
        } catch {
          return false;
        }
      });

      onPlatformSelect(detectedPlatform?.platform || 'Custom', customUrl);
      setCustomUrl('');
      setShowCustom(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-background">
      <div className="flex items-center justify-between">
        <h6 className="text-base font-medium">Add Platform</h6>
        <Button variant="ghost" size="sm" onClick={() => setShowCustom(!showCustom)}>
          <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
          Custom URL
        </Button>
      </div>

      {showCustom && (
        <div className="flex flex-col gap-2 p-3 bg-muted">
          <Label htmlFor="custom-url">Custom URL</Label>
          <div className="flex gap-2">
            <Input
              id="custom-url"
              placeholder="https://platform.com/username"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
            />
            <Button onClick={handleCustomAdd} disabled={!customUrl.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              width: 16,
              height: 16,
              color: 'var(--muted-foreground)',
            }}
          />
          <Input
            placeholder="Search platforms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className="px-3 py-1 text-sm font-medium transition-colors"
              style={{
                backgroundColor: selectedCategory === category ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                color: selectedCategory === category ? 'hsl(var(--primary-foreground))' : 'hsl(var(--secondary-foreground))',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedCategory(category)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto"
        style={{ maxHeight: 240 }}
      >
        {filteredPlatforms.map((platform) => {
          const Icon = platform.icon;
          return (
            <Button
              key={platform.platform}
              variant="outline"
              onClick={() => handleQuickAdd(platform)}
            >
              <Icon style={{ width: 20, height: 20 }} />
              <span className="text-xs text-center">{platform.platform}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
