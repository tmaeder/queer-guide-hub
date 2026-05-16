/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModernVideoPlayer } from '../modern-video-player';

describe('ModernVideoPlayer', () => {
  it('renders', () => {
    const { container } = render(<ModernVideoPlayer src="https://example.com/v.mp4" />);
    expect(container).toBeTruthy();
  });
});
