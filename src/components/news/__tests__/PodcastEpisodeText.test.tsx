import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PodcastEpisodeText } from '../PodcastEpisodeText';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe('PodcastEpisodeText', () => {
  it('shows the summary and its source while keeping notes in a closed native disclosure', () => {
    render(
      <PodcastEpisodeText
        content="Original promotional text"
        summary="The hosts discuss queer art."
        notes={'The hosts discuss queer art.\n\nGuest Alex shares their experience.'}
        version={1}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Episode overview' })).toBeInTheDocument();
    expect(screen.getByText('Based on the publisher’s show notes.')).toBeInTheDocument();
    expect(screen.getByText('The hosts discuss queer art.')).toBeVisible();
    expect(screen.getByText('Show notes').closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByText('Original promotional text')).not.toBeInTheDocument();
  });

  it('cleans pending imports instead of displaying raw ads', () => {
    render(
      <PodcastEpisodeText content="A conversation about queer artists and community archives. Follow us on Instagram." />,
    );
    expect(
      screen.getByText('A conversation about queer artists and community archives.'),
    ).toBeVisible();
    expect(screen.queryByText(/Follow us/)).not.toBeInTheDocument();
  });

  it('shows an honest empty state after a promotional-only description is processed', () => {
    render(
      <PodcastEpisodeText
        content="Subscribe to our podcast."
        notes=""
        summary={null}
        version={1}
      />,
    );
    expect(screen.getByText(/not provided enough episode detail/)).toBeVisible();
    expect(screen.queryByText('Show notes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Subscribe/)).not.toBeInTheDocument();
  });
});
