import { describe, it, expect } from 'vitest';
import * as Motion from '../index';

describe('motion barrel', () => {
  it('re-exports components', () => {
    expect(Motion.MotionPage).toBeDefined();
    expect(Motion.FadeIn).toBeDefined();
    expect(Motion.SlideIn).toBeDefined();
    expect(Motion.StaggerContainer).toBeDefined();
    expect(Motion.StaggerItem).toBeDefined();
    expect(Motion.MagneticButton).toBeDefined();
    expect(Motion.Parallax).toBeDefined();
    expect(Motion.Tappable).toBeDefined();
  });
});
