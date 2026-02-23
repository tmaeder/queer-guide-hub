import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getScoreLabel, getScoreRingColor } from '@/utils/equalityScore';

interface EqualityScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}

export default function EqualityScoreBadge({ score, size = 'md' }: EqualityScoreBadgeProps) {
  const { label } = getScoreLabel(score);
  const ringColor = getScoreRingColor(score);
  const displayScore = score ?? 0;

  const dims = {
    sm: { outer: 48, inner: 40, stroke: 3, fontSize: '0.75rem', labelSize: '0.5rem' },
    md: { outer: 64, inner: 54, stroke: 4, fontSize: '1rem', labelSize: '0.625rem' },
    lg: { outer: 88, inner: 76, stroke: 5, fontSize: '1.375rem', labelSize: '0.75rem' },
  }[size];

  const radius = (dims.inner - dims.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score != null ? (displayScore / 100) * circumference : 0;

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ position: 'relative', width: dims.outer, height: dims.outer }}>
        <svg width={dims.outer} height={dims.outer} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background circle */}
          <circle
            cx={dims.outer / 2}
            cy={dims.outer / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={dims.stroke}
          />
          {/* Progress circle */}
          {score != null && (
            <circle
              cx={dims.outer / 2}
              cy={dims.outer / 2}
              r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth={dims.stroke}
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          )}
        </svg>
        <Box sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Typography sx={{
            fontSize: dims.fontSize,
            fontWeight: 700,
            color: score != null ? ringColor : '#9ca3af',
            lineHeight: 1,
          }}>
            {score != null ? displayScore : '?'}
          </Typography>
        </Box>
      </Box>
      {size !== 'sm' && (
        <Typography sx={{
          fontSize: dims.labelSize,
          fontWeight: 600,
          color: score != null ? ringColor : '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </Typography>
      )}
    </Box>
  );
}
