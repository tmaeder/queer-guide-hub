import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FactGrid } from '@/components/transit/FactGrid';
import { DetailMasthead } from '@/components/transit/DetailMasthead';
import { SidebarCard, SidebarRow } from '@/components/transit/SidebarCard';

describe('FactGrid', () => {
  it('drops empty facts rather than rendering blank cells', () => {
    render(
      <FactGrid
        facts={[
          { label: 'Address', value: 'Admiralstraße 1' },
          { label: 'Capacity', value: null },
          { label: 'Door', value: '' },
          { label: 'Languages', value: 'German, English' },
        ]}
      />,
    );
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Languages')).toBeInTheDocument();
    expect(screen.queryByText('Capacity')).toBeNull();
    expect(screen.queryByText('Door')).toBeNull();
  });

  it('renders nothing when every fact is empty', () => {
    const { container } = render(<FactGrid facts={[{ label: 'Door', value: null }]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DetailMasthead', () => {
  it('leads with the typed route bullet and an Anton title', () => {
    render(
      <DetailMasthead type="venue" eyebrow="Venue · Nightlife" title="Südblock" status="Open now" />,
    );
    expect(screen.getByLabelText('Venue')).toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Südblock');
    expect(h1.className).toContain('font-display');
    expect(screen.getByText('Open now')).toBeInTheDocument();
  });

  it('keeps the status chip an ink outline, never a track fill', () => {
    // Status is a STATE; the system reserves colour for wayfinding, so a
    // filled chip here would read as a line rather than a status.
    render(<DetailMasthead type="event" title="Ballroom" status="Sold out" />);
    const chip = screen.getByText('Sold out');
    expect(chip.className).toContain('border-foreground');
    expect(chip.className).not.toMatch(/bg-track-/);
  });
});

describe('SidebarCard', () => {
  it('renders the ink-flooded variant for report/safety blocks', () => {
    const { container } = render(
      <SidebarCard tone="ink" title="Report venue">
        <SidebarRow label="Capacity" value="240" />
      </SidebarCard>,
    );
    expect(container.firstElementChild!.className).toContain('bg-foreground');
    expect(screen.getByText('240')).toBeInTheDocument();
  });
});
