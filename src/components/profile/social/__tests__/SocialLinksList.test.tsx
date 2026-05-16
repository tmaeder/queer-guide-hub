/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SocialLinksList } from '../SocialLinksList';

describe('SocialLinksList', () => {
  it('renders empty', () => {
    const { container } = render(
      <SocialLinksList customLinks={[]} onCustomLinkChange={vi.fn()} onRemoveCustomLink={vi.fn()} _onValidateUrl={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
