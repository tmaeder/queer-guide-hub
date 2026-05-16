/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EmailView } from '../EmailView';

describe('EmailView', () => {
  it('renders email', () => {
    const email = {
      id: 'e1',
      from_address: 'a@b.com',
      to_address: 'x@y.com',
      subject: 'Hello',
      body_html: '<p>hi</p>',
      body_text: 'hi',
      email_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      read: false,
      archived: false,
    } as never;
    const { container } = render(<EmailView email={email} />);
    expect(container).toBeTruthy();
  });
});
