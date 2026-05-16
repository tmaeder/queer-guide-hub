/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubmissionMediaSection } from '../SubmissionMediaSection';

describe('SubmissionMediaSection', () => {
  it('renders nothing when no content provided', () => {
    const { container } = render(<SubmissionMediaSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders platform + scores + safety flags', () => {
    render(
      <SubmissionMediaSection
        platform="instagram"
        queerRelevanceScore={0.85}
        confidenceScore={0.35}
        safetyFlags={[{ type: 'hate', severity: 'high', reason: 'slur' }]}
      />,
    );
    expect(screen.getByText(/platform: instagram/)).toBeInTheDocument();
    expect(screen.getByText(/relevance: 85%/)).toBeInTheDocument();
    expect(screen.getByText(/confidence: 35%/)).toBeInTheDocument();
    expect(screen.getByText(/hate · high/)).toBeInTheDocument();
  });

  it('renders OCR + transcript text blocks', () => {
    render(<SubmissionMediaSection ocrText="OCR123" transcriptText="words" />);
    expect(screen.getByText('OCR123')).toBeInTheDocument();
    expect(screen.getByText('words')).toBeInTheDocument();
  });

  it('renders up to 6 media items', () => {
    const urls = Array.from({ length: 10 }).map((_, i) => `https://x/${i}.jpg`);
    const { container } = render(<SubmissionMediaSection mediaUrls={urls} />);
    expect(container.querySelectorAll('img').length).toBe(6);
  });

  it('renders video placeholder for video URLs', () => {
    render(<SubmissionMediaSection mediaUrls={['https://x/clip.mp4']} />);
    expect(screen.getByText('video')).toBeInTheDocument();
  });
});
