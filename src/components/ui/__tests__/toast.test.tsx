/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ToastProvider, Toast, ToastTitle, ToastDescription, ToastViewport } from '../toast';

describe('Toast primitives', () => {
  it('renders', () => {
    const { container } = render(
      <ToastProvider>
        <Toast><ToastTitle>T</ToastTitle><ToastDescription>D</ToastDescription></Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    expect(container).toBeTruthy();
  });
});
