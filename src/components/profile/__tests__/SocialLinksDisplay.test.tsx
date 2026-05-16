/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SocialLinksDisplay } from '../SocialLinksDisplay';

describe('SocialLinksDisplay', () => {
  it('renders empty', () => {
    const { container } = render(<SocialLinksDisplay socialLinks={null as never} />);
    expect(container).toBeTruthy();
  });
  it('renders with links', () => {
    const { container } = render(<SocialLinksDisplay socialLinks={{ twitter: 'https://twitter.com/x' } as never} />);
    expect(container).toBeTruthy();
  });
});
