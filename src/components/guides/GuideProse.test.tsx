// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/components/tags/GlossaryLinkedText', () => ({
  GlossaryLinkedProse: ({ text }: { text: string }) => <p>{text}</p>,
}));
import { GuideProse } from './GuideProse';
describe('guide evidence prose', () => {
  it('renders primary-source links and useful headings without executing HTML', () => {
    const { container } = render(
      <GuideProse
        text={
          '## Before you go\n\nRead [operator information](https://example.com/info). <img src=x onerror=alert(1)>\n\n- Check times\n- Check admission'
        }
      />,
    );
    expect(screen.getByRole('heading', { name: 'Before you go' })).toBeTruthy();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/info');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
  });
  it('keeps unsafe source links as inert text', () => {
    render(<GuideProse text={'## Sources\n\n[bad](javascript:alert(1))'} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
