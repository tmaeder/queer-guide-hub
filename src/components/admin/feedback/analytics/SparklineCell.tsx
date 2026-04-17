import Box from '@mui/material/Box';

interface Props {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

/**
 * Tiny inline sparkline (no recharts dependency for this — keeps API-errors row
 * rendering cheap when the list is long). Shows a filled area + last-point dot.
 */
export function SparklineCell({ data, color = '#3b82f6', width = 90, height = 22 }: Props) {
  if (data.length === 0) {
    return <Box sx={{ width, height }} />;
  }
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');
  const areaPath = `M 0,${height} L ${points.replace(/ /g, ' L ')} L ${width},${height} Z`;
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * step;
  const lastY = height - (last / max) * height;
  return (
    <svg width={width} height={height} aria-hidden style={{ display: 'block' }}>
      <path d={areaPath} fill={color} fillOpacity={0.18} stroke="none" />
      <polyline fill="none" stroke={color} strokeWidth={1.2} points={points} />
      <circle cx={lastX} cy={lastY} r={1.8} fill={color} />
    </svg>
  );
}
