/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useVideos', () => ({ useVideos: () => ({ videos: [], loading: false, error: null }) }));
vi.mock('@/components/ui/modern-video-player', () => ({ ModernVideoPlayer: () => <div>video</div> }));

import Videos from '../Videos';

describe('Videos', () => {
  it('renders without crashing', () => {
    const { container } = render(<Videos />);
    expect(container).toBeTruthy();
  });
});
