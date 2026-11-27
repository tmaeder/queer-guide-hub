import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PodcastTranscriptLinks } from '../PodcastTranscriptLinks';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe('Publisher transcripts', () => {
  it('distinguishes an episode transcript from a show archive and attributes the publisher', () => {
    render(
      <PodcastTranscriptLinks
        content="Transcripts available at https://publisher.test/transcripts/"
        links={[
          { url: 'https://publisher.test/transcripts/', scope: 'show', source: 'show_notes' },
          {
            url: 'https://publisher.test/42.vtt',
            scope: 'episode',
            source: 'feed',
            type: 'text/vtt',
            language: 'en',
          },
        ]}
      />,
    );
    expect(screen.getByText('Provided by the publisher.')).toBeVisible();
    expect(screen.getByRole('link', { name: /Read episode transcript/ })).toHaveAttribute(
      'href',
      'https://publisher.test/42.vtt',
    );
    expect(screen.getByRole('link', { name: /Browse show transcripts/ })).toHaveAttribute(
      'href',
      'https://publisher.test/transcripts/',
    );
    expect(screen.getByRole('link', { name: /Read episode transcript/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('renders nothing for absent transcripts, email-only requests, or unsafe stored metadata', () => {
    const { container } = render(
      <PodcastTranscriptLinks
        content="Request a transcript: transcripts@example.com"
        links={[{ url: 'javascript:alert(1)', scope: 'episode', source: 'feed' }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does not resurrect a rejected destination from publisher notes', () => {
    const { container } = render(
      <PodcastTranscriptLinks
        content="Transcript: https://publisher.test/removed.txt"
        links={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
