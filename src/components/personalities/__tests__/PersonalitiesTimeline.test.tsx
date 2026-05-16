/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PersonalitiesTimeline } from '../PersonalitiesTimeline';

describe('PersonalitiesTimeline', () => {
  it('renders empty', () => {
    const { container } = render(<MemoryRouter><PersonalitiesTimeline personalities={[]} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
