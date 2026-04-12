import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentSanitizer } from '../ContentSanitizer';

describe('ContentSanitizer', () => {
  it('should render plain text as-is', () => {
    render(<ContentSanitizer content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('should strip script tags', () => {
    const { container } = render(
      <ContentSanitizer content='<script>alert("xss")</script>Safe text' />,
    );
    expect(container.querySelector('script')).toBeNull();
  });

  it('should allow permitted tags', () => {
    const { container } = render(
      <ContentSanitizer content="<p><strong>Bold</strong> text</p>" />,
    );
    expect(container.querySelector('strong')).not.toBeNull();
  });

  it('should strip all HTML when stripAll is true', () => {
    const { container } = render(
      <ContentSanitizer content="<p><strong>Bold</strong></p>" stripAll />,
    );
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('p')).toBeNull();
  });

  it('should strip forbidden tags like iframe', () => {
    const { container } = render(
      <ContentSanitizer content='<iframe src="http://evil.com"></iframe>Safe' />,
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('should strip onclick attributes', () => {
    const { container } = render(
      <ContentSanitizer content='<p onclick="alert(1)">Text</p>' allowedTags={['p']} />,
    );
    const p = container.querySelector('p');
    expect(p?.getAttribute('onclick')).toBeNull();
  });
});
