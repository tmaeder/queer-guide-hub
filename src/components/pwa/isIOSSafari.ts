/**
 * iOS Safari is the one browser with no install event, so it gets manual
 * instructions. The hint names Safari's share sheet, so other iOS browsers
 * (CriOS, FxiOS, EdgiOS) and in-app webviews (Instagram, Facebook, Google app),
 * which cannot add to the home screen the same way, are excluded. iPadOS
 * reports a Mac UA, so a touch-capable "Macintosh" counts as iOS.
 */
export function isIOSSafari(
  ua = navigator.userAgent,
  touchPoints = navigator.maxTouchPoints,
): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (!isIOS || !/Safari/.test(ua)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua);
}
