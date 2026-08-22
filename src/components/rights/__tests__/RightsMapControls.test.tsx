import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { RightsMapControls } from '../RightsMapControls';
import { RIGHT_TOPICS, topicBySlug } from '@/lib/rights/rightsCatalog';
import { MAP_CLASS_ORDER, type MapClass } from '@/lib/rights/rightsMapModel';

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

function baseProps(overrides: Partial<React.ComponentProps<typeof RightsMapControls>> = {}) {
  return {
    topic: criminalisation,
    onTopicChange: vi.fn(),
    lens: 'all' as const,
    onLensChange: vi.fn(),
    counts: zeroCounts,
    activeClass: null,
    onActiveClassChange: vi.fn(),
    ...overrides,
  };
}

describe('RightsMapControls — line selector', () => {
  it('renders all 18 stations', () => {
    render(<RightsMapControls {...baseProps()} />);
    // marriage/civil-union share a `labelDefault` ("Same-sex unions"), so the
    // stable assertion is the total button count inside the line-selector
    // group, not 18 distinct accessible names.
    const group = screen.getByRole('group', { name: 'Rights' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.length).toBe(RIGHT_TOPICS.length);
  });

  it('clicking a station calls onTopicChange with that topic', async () => {
    const onTopicChange = vi.fn();
    render(<RightsMapControls {...baseProps({ onTopicChange })} />);
    await userEvent.click(screen.getByRole('button', { name: employment.labelDefault }));
    expect(onTopicChange).toHaveBeenCalledWith(employment);
  });

  it('marks the active station aria-pressed=true and others false', () => {
    render(<RightsMapControls {...baseProps({ topic: employment })} />);
    expect(screen.getByRole('button', { name: employment.labelDefault })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: criminalisation.labelDefault })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('RightsMapControls — lens selector', () => {
  it('disables the lens buttons with an explanation for a non-matrix topic', () => {
    render(<RightsMapControls {...baseProps({ topic: criminalisation })} />);
    expect(screen.getByRole('button', { name: 'Everyone' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sexual orientation' })).toBeDisabled();
    expect(
      screen.getByText('This law is recorded once for everyone — no per-group reading exists.'),
    ).toBeInTheDocument();
  });

  it('enables the lens buttons for a protection-matrix topic (employment)', () => {
    render(<RightsMapControls {...baseProps({ topic: employment })} />);
    expect(screen.getByRole('button', { name: 'Everyone' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Gender identity' })).toBeEnabled();
    expect(
      screen.queryByText('This law is recorded once for everyone — no per-group reading exists.'),
    ).not.toBeInTheDocument();
  });

  it('calls onLensChange when an enabled lens button is clicked', async () => {
    const onLensChange = vi.fn();
    render(<RightsMapControls {...baseProps({ topic: employment, onLensChange })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gender identity' }));
    expect(onLensChange).toHaveBeenCalledWith('gi');
  });
});

describe('RightsMapControls — route-strip legend', () => {
  const counts: Record<MapClass, number> = {
    ...zeroCounts,
    protected: 100,
    criminalised: 50,
    death: 12,
  };

  it('renders counts for non-zero classes only', () => {
    render(<RightsMapControls {...baseProps({ counts })} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('omits a zero-count class', () => {
    render(<RightsMapControls {...baseProps({ counts })} />);
    expect(screen.queryByText('rights.map.class.partial')).not.toBeInTheDocument();
    // partial is 0 in `counts`, so its label must not render at all.
    const legend = screen.getByRole('list', { name: /country counts by status/i });
    expect(legend.textContent).not.toMatch(/Partial protection/);
  });

  it('clicking a legend station toggles onActiveClassChange, active → null', async () => {
    const onActiveClassChange = vi.fn();
    const { rerender } = render(
      <RightsMapControls {...baseProps({ counts, onActiveClassChange })} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /100/ }));
    expect(onActiveClassChange).toHaveBeenCalledWith('protected');

    rerender(
      <RightsMapControls
        {...baseProps({ counts, activeClass: 'protected', onActiveClassChange })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /100/ }));
    expect(onActiveClassChange).toHaveBeenLastCalledWith(null);
  });

  it('legend order follows MAP_CLASS_ORDER (most-restrictive first)', () => {
    render(<RightsMapControls {...baseProps({ counts })} />);
    const legend = screen.getByRole('list', { name: /country counts by status/i });
    const buttons = Array.from(legend.querySelectorAll('button'));
    const orderedNonZero = MAP_CLASS_ORDER.filter((c) => counts[c] > 0);
    expect(buttons.length).toBe(orderedNonZero.length);
    // death → criminalised → protected, matching MAP_CLASS_ORDER's
    // restrictive-first continuum.
    const renderedCounts = buttons.map((b) => b.querySelector('.tabular-nums')?.textContent);
    expect(renderedCounts).toEqual(orderedNonZero.map((c) => String(counts[c])));
  });
});
