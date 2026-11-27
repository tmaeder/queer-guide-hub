import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ProgrammeChild } from '@/utils/prideProgramme';
import { buildProgrammeIcs } from '@/utils/prideIcs';

const download = vi.fn();
vi.mock('@/utils/prideIcs', async (orig) => ({
  ...(await orig<typeof import('@/utils/prideIcs')>()),
  downloadIcs: (...a: unknown[]) => download(...a),
}));

const { EventProgramme } = await import('@/components/events/EventProgramme');

let seq = 0;
const child = (over: Partial<ProgrammeChild> = {}): ProgrammeChild => ({
  id: `c${seq++}`,
  slug: `slug-${seq}`,
  title: `Child ${seq}`,
  start_date: '2027-09-10T19:00:00',
  ...over,
});

const umbrella = {
  id: 'u1',
  slug: 'folsom-europe-2027',
  title: 'Folsom Europe 2027',
  start_date: '2027-09-08T00:00:00',
  end_date: '2027-09-12T00:00:00',
};

beforeEach(() => download.mockReset());

describe('whole-programme calendar', () => {
  it('downloads the WHOLE programme, including the page the reader is on', async () => {
    const all = [child({ title: 'This Page' }), child({ title: 'Sibling' })];
    render(
      <MemoryRouter>
        <EventProgramme entries={[all[1]]} calendar={{ umbrella, children: all }} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Add programme to calendar/ }));
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, ics] = download.mock.calls[0] as [string, string];
    expect(filename).toBe('folsom-europe-2027.ics');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain('SUMMARY:This Page');
  });

  it('is not offered without an umbrella', () => {
    render(
      <MemoryRouter>
        <EventProgramme entries={[child({ title: 'Alone' })]} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /Add programme to calendar/ })).toBeNull();
    expect(screen.getByText('Alone')).toBeInTheDocument();
  });
});

describe('buildProgrammeIcs', () => {
  it('umbrella + one VEVENT per child; satellites say so; text is escaped', () => {
    const ics = buildProgrammeIcs(
      { ...umbrella, title: 'Fest, 2027' },
      [child({ title: 'Main' }), child({ title: 'Warm-up', programme_official: false })],
      'Berlin, Germany',
    );
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain('SUMMARY:Warm-up (satellite event)');
    expect(ics).toContain('X-WR-CALNAME:Fest\\, 2027');
    expect(ics).toContain('LOCATION:Berlin\\, Germany');
  });
});
