import { describe, it, expect } from 'vitest';
import {
  BREAKPOINTS,
  generateSrcSet,
  getOptimizedImageUrl,
  calculateSizes,
  IMAGE_CONFIG,
  SIZE_PRESETS,
} from '../image-utils';

describe('BREAKPOINTS', () => {
  it('should be sorted ascending', () => {
    for (let i = 1; i < BREAKPOINTS.length; i++) {
      expect(BREAKPOINTS[i]).toBeGreaterThan(BREAKPOINTS[i - 1]);
    }
  });
});

describe('generateSrcSet', () => {
  it('should generate srcset for all breakpoints', () => {
    const srcset = generateSrcSet('hero', 'webp');
    for (const bp of BREAKPOINTS) {
      expect(srcset).toContain(`hero-${bp}.webp ${bp}w`);
    }
  });

  it('should use correct format extension', () => {
    expect(generateSrcSet('bg', 'avif')).toContain('.avif');
    expect(generateSrcSet('bg', 'jpg')).toContain('.jpg');
  });

  it('should include /images/optimized/ prefix', () => {
    expect(generateSrcSet('test', 'webp')).toContain('/images/optimized/');
  });
});

describe('getOptimizedImageUrl', () => {
  it('should return closest available size', () => {
    const url = getOptimizedImageUrl('hero', 500);
    expect(url).toContain('hero-640');
  });

  it('should default to webp format', () => {
    expect(getOptimizedImageUrl('hero')).toContain('.webp');
  });

  it('should use largest breakpoint for very large widths', () => {
    const url = getOptimizedImageUrl('hero', 5000);
    expect(url).toContain(`hero-${BREAKPOINTS[BREAKPOINTS.length - 1]}`);
  });

  it('should accept format parameter', () => {
    expect(getOptimizedImageUrl('hero', 300, 'avif')).toContain('.avif');
  });
});

describe('calculateSizes', () => {
  it('should return default sizes string', () => {
    const sizes = calculateSizes();
    expect(sizes).toContain('768px');
    expect(sizes).toContain('1200px');
  });

  it('should accept custom options', () => {
    const sizes = calculateSizes({ mobile: 100, tablet: 80, desktop: 800 });
    expect(sizes).toContain('100vw');
    expect(sizes).toContain('80vw');
    expect(sizes).toContain('800px');
  });
});

describe('IMAGE_CONFIG', () => {
  it('should include all three formats', () => {
    expect(IMAGE_CONFIG.formats).toContain('avif');
    expect(IMAGE_CONFIG.formats).toContain('webp');
    expect(IMAGE_CONFIG.formats).toContain('jpg');
  });
});

describe('SIZE_PRESETS', () => {
  it('should have hero preset', () => {
    expect(SIZE_PRESETS.hero.width).toBe(1920);
    expect(SIZE_PRESETS.hero.height).toBe(1080);
  });

  it('should have avatar preset', () => {
    expect(SIZE_PRESETS.avatar.width).toBe(128);
  });
});
