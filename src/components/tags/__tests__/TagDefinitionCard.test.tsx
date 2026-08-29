import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TagDefinitionCard } from '../TagDefinitionCard';
import type { TagPreview } from '@/hooks/useTagPreviews';

const base: TagPreview = {
  id: '1',
  slug: 'bear-bar',
  name: 'Bear bar',
  short_description: 'A bar for bears and their admirers.',
  description: 'Longer definition text.',
  category: 'Nightlife & Venues',
  is_adult: false,
  is_sensitive: false,
  image_url: null,
  usage_count: 12,
};

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('TagDefinitionCard', () => {
  it('renders the definition and a link to the glossary entry', () => {
    wrap(<TagDefinitionCard preview={base} affirmed={false} />);
    expect(screen.getByText('A bar for bears and their admirers.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read the entry' })).toHaveAttribute(
      'href',
      '/tags/bear-bar',
    );
  });

  it('hides the definition for adult terms when unaffirmed', () => {
    const adult: TagPreview = { ...base, is_adult: true };
    wrap(<TagDefinitionCard preview={adult} affirmed={false} />);
    expect(screen.queryByText(adult.short_description!)).not.toBeInTheDocument();
    expect(screen.getByText(/18\+ term/)).toBeInTheDocument();
  });

  it('gates on adult category names even when is_adult is false', () => {
    const adult: TagPreview = { ...base, category: 'Sex & Kink' };
    wrap(<TagDefinitionCard preview={adult} affirmed={false} />);
    expect(screen.queryByText(adult.short_description!)).not.toBeInTheDocument();
    expect(screen.getByText(/18\+ term/)).toBeInTheDocument();
  });

  it('shows the definition for adult terms once affirmed', () => {
    const adult: TagPreview = { ...base, is_adult: true };
    wrap(<TagDefinitionCard preview={adult} affirmed />);
    expect(screen.getByText(adult.short_description!)).toBeInTheDocument();
    expect(screen.queryByText(/18\+ term/)).not.toBeInTheDocument();
  });

  it('keeps definitions for sensitive non-adult terms', () => {
    const sensitive: TagPreview = { ...base, is_sensitive: true };
    wrap(<TagDefinitionCard preview={sensitive} affirmed={false} />);
    expect(screen.getByText(sensitive.short_description!)).toBeInTheDocument();
  });
});
