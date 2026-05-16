/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModernAudioPlayer } from '../modern-audio-player';

describe('ModernAudioPlayer', () => {
  it('renders', () => {
    const { container } = render(<ModernAudioPlayer audio={{ id: 'a1', title: 'T', file_path: 'https://x/a.mp3', renditions: [] } as never} />);
    expect(container).toBeTruthy();
  });
});
