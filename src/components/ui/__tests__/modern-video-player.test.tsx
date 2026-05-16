/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModernVideoPlayer } from '../modern-video-player';

describe('ModernVideoPlayer', () => {
  it('renders', () => {
    const { container } = render(<ModernVideoPlayer video={{ id: 'v1', title: 'T', file_path: 'https://x/v.mp4', renditions: [] } as never} />);
    expect(container).toBeTruthy();
  });
});
