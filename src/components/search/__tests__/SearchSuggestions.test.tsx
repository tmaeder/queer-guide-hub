import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Command } from '@/components/ui/command';
import { Search } from 'lucide-react';
import { SearchSuggestions } from '../SearchSuggestions';

const renderWithCommand = (ui: React.ReactElement) =>
  render(<Command>{ui}</Command>);

const mockSuggestion = {
  id: '1',
  type: 'venue',
  name: 'Rainbow Bar',
  title: 'Rainbow Bar',
  subtitle: 'Berlin, Germany',
  icon: Search,
};

describe('SearchSuggestions', () => {
  it('should render nothing when no suggestions and not loading', () => {
    const { container } = render(
      <SearchSuggestions suggestions={[]} loading={false} query="test" onSelectSuggestion={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('should render loading state', () => {
    renderWithCommand(
      <SearchSuggestions suggestions={[]} loading={true} query="bar" onSelectSuggestion={vi.fn()} />,
    );
    expect(screen.getByText(/finding results/i)).toBeInTheDocument();
  });

  it('should not show loading for short query', () => {
    renderWithCommand(
      <SearchSuggestions suggestions={[]} loading={true} query="a" onSelectSuggestion={vi.fn()} />,
    );
    expect(screen.queryByText(/finding results/i)).not.toBeInTheDocument();
  });

  it('should render suggestions with name and type badge', () => {
    renderWithCommand(
      <SearchSuggestions
        suggestions={[mockSuggestion as unknown as React.ComponentProps<typeof SearchSuggestions>['suggestions'][number]]}
        loading={false}
        query="bar"
        onSelectSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByText('Rainbow Bar')).toBeInTheDocument();
    expect(screen.getByText('venue')).toBeInTheDocument();
  });

  it('should render subtitle when provided', () => {
    renderWithCommand(
      <SearchSuggestions
        suggestions={[mockSuggestion as unknown as React.ComponentProps<typeof SearchSuggestions>['suggestions'][number]]}
        loading={false}
        query="bar"
        onSelectSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByText('Berlin, Germany')).toBeInTheDocument();
  });
});
