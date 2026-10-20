import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContentWarningGate } from '../ContentWarningGate';

const img = <img alt="beach" src="/x.jpg" />;

describe('ContentWarningGate', () => {
  it('renders media untouched without a blur decision', () => {
    render(<ContentWarningGate moderation={undefined}>{img}</ContentWarningGate>);
    expect(screen.getByAltText('beach')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
  });

  it('blurs with a text reason and reveals on Show', () => {
    render(
      <ContentWarningGate
        moderation={{
          filter: false,
          blurMedia: true,
          noOverride: false,
          reasons: ['Sexually suggestive'],
        }}
      >
        {img}
      </ContentWarningGate>,
    );
    expect(screen.getByText('Sexually suggestive')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.queryByText('Sexually suggestive')).toBeNull();
  });

  it('cannot be opened when the decision says noOverride', () => {
    render(
      <ContentWarningGate
        moderation={{
          filter: false,
          blurMedia: true,
          noOverride: true,
          reasons: ['Adult content'],
        }}
      >
        {img}
      </ContentWarningGate>,
    );
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
    expect(screen.getByText(/Turn on adult content/)).toBeInTheDocument();
  });
});
