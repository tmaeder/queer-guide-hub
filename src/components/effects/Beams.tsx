interface BeamsProps {
  count?: number;
  className?: string;
}

/**
 * Decorative beams effect — gutted to a no-op 2026-05-19 per
 * refactor/monochrome-2026. Existing call sites kept rendering for one
 * cycle so each consumer can drop the import on its own commit. Visual
 * impact: gone. JS impact: zero.
 */
export function Beams(_props: BeamsProps) {
  return null;
}
