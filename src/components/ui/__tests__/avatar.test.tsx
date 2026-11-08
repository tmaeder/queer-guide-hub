/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';

const created: Array<{ onload?: () => void; onerror?: () => void; src?: string }> = [];
class FakeImage {
  onload?: () => void;
  onerror?: () => void;
  src?: string;
  constructor() {
    created.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  created.length = 0;
});

function renderAvatar(src?: string) {
  return render(
    <Avatar>
      <AvatarImage src={src} alt="Ada" />
      <AvatarFallback>AL</AvatarFallback>
    </Avatar>,
  );
}

describe('Avatar', () => {
  it('shows the fallback and no <img> while the image is loading', () => {
    vi.stubGlobal('Image', FakeImage);
    const { container } = renderAvatar('a.jpg');
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('swaps to the <img> once it loads', () => {
    vi.stubGlobal('Image', FakeImage);
    renderAvatar('a.jpg');
    act(() => created[0].onload?.());
    expect(screen.getByRole('img', { name: 'Ada' })).toHaveAttribute('src', 'a.jpg');
    expect(screen.queryByText('AL')).toBeNull();
  });

  it('keeps the fallback when the image fails or has no src', () => {
    vi.stubGlobal('Image', FakeImage);
    renderAvatar('broken.jpg');
    act(() => created[0].onerror?.());
    expect(screen.getByText('AL')).toBeInTheDocument();
    renderAvatar(undefined);
    expect(screen.getAllByText('AL')).toHaveLength(2);
  });

  it('delays the fallback when delayMs is set', () => {
    vi.useFakeTimers();
    render(
      <Avatar>
        <AvatarFallback delayMs={300}>AL</AvatarFallback>
      </Avatar>,
    );
    expect(screen.queryByText('AL')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText('AL')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
