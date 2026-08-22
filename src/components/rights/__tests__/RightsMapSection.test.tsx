import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { RightsMapSection } from '../RightsMapSection';
import { topicBySlug } from '@/lib/rights/rightsCatalog';
import type { MapClass } from '@/lib/rights/rightsMapModel';
import type { RightsCountry } from '@/hooks/useIntentData';

/**
 * `RightsWorldMap` mounts real MapLibre wiring (see RightsWorldMap.test.tsx,
 * which mocks `maplibre-gl` itself for that). This suite is about the
 * SECTION's composition — that it wires the controls, the map and the
 * coverage note together and forwards props correctly — so the map is
 * stubbed to a labelled placeholder rather than re-mocking MapLibre here too.
 */
vi.mock('../RightsWorldMap', () => ({
  RightsWorldMap: ({
    topic,
    onCountrySelect,
  }: {
    topic: { labelDefault: string };
    onCountrySelect: (c: RightsCountry) => void;
  }) => (
    <div role="img" aria-label={`World map: ${topic.labelDefault}. stub`}>
      <button
        type="button"
        onClick={() => onCountrySelect({ id: 'c-de', slug: 'germany' } as RightsCountry)}
      >
        stub country click
      </button>
    </div>
  ),
}));

const criminalisation = topicBySlug('criminalisation')!;
const employment = topicBySlug('employment')!;

const zeroCounts: Record<MapClass, number> = {
  protected: 0,
  partial: 0,
  restricted: 0,
  criminalised: 0,
  death: 0,
  deathPossible: 0,
  nodata: 0,
};

function baseProps(overrides: Partial<React.ComponentProps<typeof RightsMapSection>> = {}) {
  return {
    countries: [] as RightsCountry[],
    topic: criminalisation,
    onTopicChange: vi.fn(),
    lens: 'all' as const,
    onLensChange: vi.fn(),
    activeClass: null,
    onActiveClassChange: vi.fn(),
    counts: zeroCounts,
    onCountrySelect: vi.fn(),
    ...overrides,
  };
}

describe('RightsMapSection', () => {
  it('renders the line selector, the map, and a coverage note citing ILGA', () => {
    render(<RightsMapSection {...baseProps()} />);
    expect(screen.getByRole('group', { name: 'Rights' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /World map:/ })).toBeInTheDocument();
    expect(screen.getByText(/ILGA World Database, re-imported nightly/)).toBeInTheDocument();
    expect(screen.getByText(/never as safe/)).toBeInTheDocument();
  });

  it('passes the active topic through to both the controls and the map', () => {
    render(<RightsMapSection {...baseProps({ topic: employment })} />);
    expect(screen.getByRole('button', { name: employment.labelDefault })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('img', { name: `World map: ${employment.labelDefault}. stub` }),
    ).toBeInTheDocument();
  });

  it('clicking a station in the controls calls onTopicChange', async () => {
    const onTopicChange = vi.fn();
    render(<RightsMapSection {...baseProps({ onTopicChange })} />);
    await userEvent.click(screen.getByRole('button', { name: employment.labelDefault }));
    expect(onTopicChange).toHaveBeenCalledWith(employment);
  });

  it('forwards a map country-select up to onCountrySelect', async () => {
    const onCountrySelect = vi.fn();
    render(<RightsMapSection {...baseProps({ onCountrySelect })} />);
    await userEvent.click(screen.getByRole('button', { name: 'stub country click' }));
    expect(onCountrySelect).toHaveBeenCalledWith({ id: 'c-de', slug: 'germany' });
  });
});
