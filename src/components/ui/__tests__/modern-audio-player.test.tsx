/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModernAudioPlayer } from '../modern-audio-player';

describe('ModernAudioPlayer', () => {
  it('renders', () => {
    const { container } = render(<ModernAudioPlayer src="https://example.com/a.mp3" title="X" />);
    expect(container).toBeTruthy();
  });
});
