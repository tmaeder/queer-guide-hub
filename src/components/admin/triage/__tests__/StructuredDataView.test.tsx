/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StructuredFieldEditor, StructuredValue } from '../StructuredDataView';
import { coordinatesFromLocation, withLocationCoordinates } from '../governanceFieldControlUtils';

vi.mock('@/hooks/usePageFetchers', () => ({
  listFrom: vi
    .fn()
    .mockResolvedValue([{ id: 'ch', name: 'Switzerland', code: 'CH', flag_emoji: '🇨🇭' }]),
  listFromIn: vi.fn().mockResolvedValue([]),
  listFromWhere: vi.fn().mockResolvedValue([]),
  searchUnifiedTagsByName: vi.fn().mockResolvedValue([]),
}));

vi.mock('../ReviewLocationMap', () => ({
  default: ({ onCoordinateChange }: { onCoordinateChange: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onCoordinateChange(47.3769, 8.5417)}>
      Move marker
    </button>
  ),
}));

describe('StructuredValue', () => {
  it('renders nested records as labeled content instead of serialized JSON', () => {
    render(
      <StructuredValue value={{ city: 'Zürich', country: 'CH', access: { stepFree: true } }} />,
    );
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Zürich')).toBeInTheDocument();
    expect(screen.getByText('Step Free')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.queryByText(/\{"city"/)).not.toBeInTheDocument();
  });

  it('renders URLs as links and lists as chips', () => {
    render(
      <StructuredValue value={{ website: 'https://example.org/place', tags: ['cafe', 'queer'] }} />,
    );
    expect(screen.getByRole('link', { name: /example\.org\/place/ })).toHaveAttribute(
      'href',
      'https://example.org/place',
    );
    expect(screen.getByText('cafe')).toBeInTheDocument();
    expect(screen.getByText('queer')).toBeInTheDocument();
  });
});

describe('StructuredFieldEditor', () => {
  it('tracks a correction and sends only changed fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDirtyChange = vi.fn();
    render(
      <StructuredFieldEditor
        data={{ name: 'Old name', description: 'Readable description', active: true }}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Old name'), { target: { value: 'Correct name' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(1));
    fireEvent.click(screen.getByRole('button', { name: 'Save 1' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Correct name' }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(0));
  });

  it('uses canonical selects for venue category and event type', () => {
    const onVenueSave = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <StructuredFieldEditor entityType="venue" data={{ category: 'bar' }} onSave={onVenueSave} />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'cafe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save 1' }));
    expect(onVenueSave).toHaveBeenCalledWith({ category: 'cafe' });
    unmount();

    render(
      <StructuredFieldEditor
        entityType="event"
        data={{ event_type: 'party' }}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Event type' })).toBeInTheDocument();
  });

  it('keeps unknown imported tags visible instead of silently dropping them', async () => {
    render(
      <StructuredFieldEditor
        entityType="venue"
        data={{ tags: ['legacy-import'] }}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('legacy-import')).toBeInTheDocument();
    expect(screen.getByText('unrecognized')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search canonical tags' })).toBeInTheDocument();
  });

  it('saves map coordinate edits as one nested location change', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <StructuredFieldEditor
        entityType="venue"
        data={{ location: { address: 'Main Street 1', city: 'Zürich', country: 'CH' } }}
        onSave={onSave}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Move marker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save 1' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        location: {
          address: 'Main Street 1',
          city: 'Zürich',
          country: 'CH',
          lat: 47.3769,
          lng: 8.5417,
        },
      }),
    );
  });
});

describe('location coordinate helpers', () => {
  it('preserves the payload key convention and clamps marker positions', () => {
    expect(coordinatesFromLocation({ latitude: '47.1', longitude: 8.2 })).toMatchObject({
      latitudeKey: 'latitude',
      longitudeKey: 'longitude',
      latitude: 47.1,
      longitude: 8.2,
    });
    expect(withLocationCoordinates({ latitude: 47, longitude: 8 }, 95, -190)).toEqual({
      latitude: 90,
      longitude: -180,
    });
  });
});
