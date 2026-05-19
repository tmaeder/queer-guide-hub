export type WorldArc = {
  start: { lat: number; lng: number; label?: string };
  end: { lat: number; lng: number; label?: string };
};

interface WorldMapProps {
  dots?: WorldArc[];
  lineColor?: string;
  className?: string;
}

export function WorldMap(_props: WorldMapProps) {
  return null;
}
