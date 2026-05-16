/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Home } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { DetailTabs } from '../DetailTabs';

const tabs = [
  { value: 'a', label: 'About' },
  { value: 'b', label: 'Bar', icon: Home },
];

describe('DetailTabs', () => {
  it('renders one trigger per tab', () => {
    render(<DetailTabs tabs={tabs}><div /></DetailTabs>);
    expect(screen.getByRole('tab', { name: /About/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Bar/i })).toBeInTheDocument();
  });

  it('defaults to first tab when no defaultValue', () => {
    render(
      <DetailTabs tabs={tabs}>
        <TabsContent value="a">A panel</TabsContent>
        <TabsContent value="b">B panel</TabsContent>
      </DetailTabs>,
    );
    expect(screen.getByRole('tab', { name: /About/i })).toHaveAttribute('data-state', 'active');
  });

  it('honors explicit defaultValue', () => {
    render(
      <DetailTabs tabs={tabs} defaultValue="b">
        <TabsContent value="a">A</TabsContent>
        <TabsContent value="b">B</TabsContent>
      </DetailTabs>,
    );
    expect(screen.getByRole('tab', { name: /Bar/i })).toHaveAttribute('data-state', 'active');
  });

  it('renders icon when provided', () => {
    const { container } = render(<DetailTabs tabs={tabs}><div /></DetailTabs>);
    expect(container.querySelector('svg.lucide-house, svg.lucide-home')).not.toBeNull();
  });
});
