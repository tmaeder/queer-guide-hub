import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus } from 'lucide-react';
import { PLATFORM_CONFIGS, PlatformConfig } from './platformConfigs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      // Auto-detect platform from URL
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
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          Add Platform
        </Typography>
        <Button variant="ghost" size="sm" onClick={() => setShowCustom(!showCustom)}>
          <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
          Custom URL
        </Button>
      </Box>

      {showCustom && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            p: 1.5,
            bgcolor: 'action.hover',
            borderRadius: 1.5,
          }}
        >
          <Label htmlFor="custom-url">Custom URL</Label>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Input
              id="custom-url"
              placeholder="https://platform.com/username"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
            />
            <Button onClick={handleCustomAdd} disabled={!customUrl.trim()}>
              Add
            </Button>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ position: 'relative' }}>
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
            sx={{ pl: 5 }}
          />
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {categories.map((category) => (
            <Box
              component="button"
              key={category}
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: '9999px',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'colors 0.2s',
                bgcolor: selectedCategory === category ? 'primary.main' : 'secondary.main',
                color:
                  selectedCategory === category ? 'primary.contrastText' : 'secondary.contrastText',
                '&:hover': {
                  bgcolor: selectedCategory === category ? 'primary.main' : 'secondary.dark',
                  opacity: 0.8,
                },
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedCategory(category)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
          gap: 1,
          maxHeight: 240,
          overflowY: 'auto',
        }}
      >
        {filteredPlatforms.map((platform) => {
          const Icon = platform.icon;
          return (
            <Button
              key={platform.platform}
              variant="outline"
              sx={{
                height: 'auto',
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => handleQuickAdd(platform)}
            >
              <Icon style={{ width: 20, height: 20 }} />
              <Typography variant="caption" sx={{ textAlign: 'center' }}>
                {platform.platform}
              </Typography>
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
