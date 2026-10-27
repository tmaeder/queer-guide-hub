import { afterEach, describe, expect, it } from 'vitest';
import { getCspNonce } from '../cspNonce';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('getCspNonce', () => {
  it('uses the DOM nonce property even when browsers hide the attribute value', () => {
    const script = document.createElement('script');
    script.nonce = 'document-nonce';
    document.head.append(script);
    expect(getCspNonce()).toBe('document-nonce');
  });
  it('leaves Vite development without a nonce', () => {
    expect(getCspNonce()).toBeUndefined();
  });
});
