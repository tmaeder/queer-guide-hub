/** Only website navigation needs a notice; calls, mail and quick exit stay immediate. */
export function externalDestination(href: string, origin: string): URL | null {
  try {
    const url = new URL(href, origin);
    return /^https?:$/.test(url.protocol) && url.origin !== origin ? url : null;
  } catch {
    return null;
  }
}
