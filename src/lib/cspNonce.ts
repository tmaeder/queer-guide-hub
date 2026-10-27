/** Nonce stamped by Pages on the document's script elements. Vite dev has none. */
export function getCspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || undefined;
}
