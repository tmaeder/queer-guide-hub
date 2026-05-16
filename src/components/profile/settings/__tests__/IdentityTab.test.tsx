/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { IdentityTab } from '../IdentityTab';

describe('IdentityTab', () => {
  it('renders', () => {
    const { container } = render(<IdentityTab formData={{ gender_identity: '', sexual_orientation: '', chosen_family_status: '', disability_status: '', neurodivergent_status: '', coming_out_status: { family: '', friends: '', work: '', public: '' } } as never} onChange={vi.fn()} onComingOutChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
