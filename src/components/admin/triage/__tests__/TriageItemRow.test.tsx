/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TriageItemRow } from '../TriageItemRow';
import { splitQualityTitle, fieldBadgeLabel } from '@/lib/qualityQueue';

const item = {
  id: 'i1',
  title: 'Pending venue',
  subtitle: 'low_quality_score',
  queue_type: 'staging',
  content_type: 'venues',
  confidence_score: 0.65,
  has_diff: true,
  created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(),
} as never;

describe('TriageItemRow', () => {
  it('renders title + queue + content badges', () => {
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByText('Pending venue')).toBeInTheDocument();
    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('diff')).toBeInTheDocument();
  });

  it('shows confidence + age', () => {
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('clicking row calls onSelect', () => {
    const onSelect = vi.fn();
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={onSelect}
        onToggleCheck={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Pending venue'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('clicking checkbox calls onToggleCheck and stops propagation', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <TriageItemRow
        item={item}
        isActive={false}
        isSelected={false}
        onSelect={onSelect}
        onToggleCheck={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

/**
 * Quality rows.
 *
 * Every quality row used to render its queue badge as "Quality Personality" —
 * the queue's own name, repeated ~4,000 times, which is the one thing that
 * cannot tell one row from the next. And the title arrives pre-joined
 * server-side as "<name> — <field>", so the field was printed twice and the
 * entity name competed with it for the truncation window.
 */
describe('splitQualityTitle', () => {
  it('lifts the field out of a pre-joined quality title', () => {
    expect(
      splitQualityTitle('Sergeant Miles — social_links.pornhub', 'social_links.pornhub'),
    ).toEqual({ name: 'Sergeant Miles', field: 'social_links.pornhub' });
  });

  it('leaves the title alone when the row carries no field', () => {
    expect(splitQualityTitle('Pending venue', undefined)).toEqual({
      name: 'Pending venue',
      field: null,
    });
  });

  /**
   * An entity whose own name happens to contain the separator must not be
   * truncated. Only a trailing " — <field>" is a join, and only when it
   * matches the field the row actually carries.
   */
  it('does not cut a name that merely contains the separator', () => {
    expect(splitQualityTitle('Sunset — Bar — safety_notes', 'safety_notes')).toEqual({
      name: 'Sunset — Bar',
      field: 'safety_notes',
    });
    expect(splitQualityTitle('Sunset — Bar', 'safety_notes')).toEqual({
      name: 'Sunset — Bar',
      field: 'safety_notes',
    });
  });
});

describe('fieldBadgeLabel', () => {
  it('drops the jsonb path prefix', () => {
    expect(fieldBadgeLabel('social_links.xvideos')).toBe('xvideos');
  });
  it('humanises an ordinary column', () => {
    expect(fieldBadgeLabel('accessibility_attributes')).toBe('accessibility attributes');
  });
});

describe('TriageItemRow — quality rows', () => {
  const qualityItem = {
    id: 'q1',
    title: 'Kabul — safety_notes',
    subtitle: 'composer:derived',
    queue_type: 'quality-city',
    content_type: 'cities',
    confidence_score: 1,
    has_diff: false,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    meta: { field: 'safety_notes' },
    risk_flags: { confirm_may_be_required: true },
  } as never;

  it('labels the queue "Quality", not the humanised key', () => {
    render(
      <TriageItemRow
        item={qualityItem}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByText('Quality')).toBeInTheDocument();
    expect(screen.queryByText('Quality City')).not.toBeInTheDocument();
  });

  it('shows the entity name in the title and the field as its own badge', () => {
    render(
      <TriageItemRow
        item={qualityItem}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByText('Kabul')).toBeInTheDocument();
    expect(screen.getByText('safety notes')).toBeInTheDocument();
    expect(screen.queryByText('Kabul — safety_notes')).not.toBeInTheDocument();
  });

  /**
   * `confirm_may_be_required` has been emitted by triage_src_quality_city since
   * that view existed and no component ever read it — the same way `namesake`
   * sat unread on the dedup rows.
   */
  it('marks a row that will demand a safety confirmation', () => {
    render(
      <TriageItemRow
        item={qualityItem}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.getByText('confirm')).toBeInTheDocument();
  });

  it('does not mark a row that carries no risk flag', () => {
    const plain = {
      ...(qualityItem as unknown as Record<string, unknown>),
      risk_flags: {},
    } as never;
    render(
      <TriageItemRow
        item={plain}
        isActive={false}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleCheck={vi.fn()}
      />,
    );
    expect(screen.queryByText('confirm')).not.toBeInTheDocument();
  });
});
