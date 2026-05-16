/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { EventsCalendarView } from '../EventsCalendarView';

describe('EventsCalendarView', () => {
  it('renders without crashing', () => {
    const { container } = render(<EventsCalendarView events={[]} onEventSelect={vi.fn()} onAttendanceUpdate={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
