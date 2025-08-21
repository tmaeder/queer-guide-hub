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

  const categories = ['all', ...new Set(PLATFORM_CONFIGS.map(p => p.category))];
  
  const filteredPlatforms = PLATFORM_CONFIGS.filter(platform => {
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
      // Auto-detect platform from URL
      const detectedPlatform = PLATFORM_CONFIGS.find(p => {
        try {
          const regex = new RegExp(p.urlDetectionRegex.replace(/^\(\?\i\)/, ''), 'i');
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
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Add Platform</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCustom(!showCustom)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Custom URL
        </Button>
      </div>

      {showCustom && (
        <div className="space-y-2 p-3 bg-muted rounded-md">
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

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search platforms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === category 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
              onClick={() => setSelectedCategory(category)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
        {filteredPlatforms.map((platform) => {
          const Icon = platform.icon;
          return (
            <Button
              key={platform.platform}
              variant="outline"
              className="h-auto p-3 flex flex-col items-center gap-2 hover:bg-accent"
              onClick={() => handleQuickAdd(platform)}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs text-center">{platform.platform}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}