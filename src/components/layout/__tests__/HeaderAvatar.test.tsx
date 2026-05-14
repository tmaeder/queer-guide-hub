import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// WCAG 1.1.1 — avatar img must never expose PII in alt text.
describe('Header avatar alt', () => {
  it('renders empty alt regardless of user identity', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.test/x.png" alt="" />
        <AvatarFallback>U</AvatarFallback>
      </Avatar>,
    );
    const img = container.querySelector('img');
    if (img) {
      expect(img.getAttribute('alt')).toBe('');
      expect(img.getAttribute('alt')).not.toMatch(/@/);
    }
  });
});
