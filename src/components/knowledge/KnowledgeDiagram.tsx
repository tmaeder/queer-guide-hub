import React from 'react';
import type { PilotFigure } from '@/lib/knowledge/pilotFigures';
export function KnowledgeDiagram({ figure }: { figure: PilotFigure }) {
  const height = figure.rows.length * 88 + 44;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 640 ${height}`}
      className="h-auto w-full text-foreground"
      aria-hidden="true"
      focusable="false"
    >
      {figure.layout === 'network' ? (
        <>
          <circle cx="64" cy={height / 2} r="24" fill="currentColor" />
          <text
            x="64"
            y={height / 2 + 5}
            textAnchor="middle"
            fill="hsl(var(--background, 0 0% 100%))"
            fontSize="15"
          >
            You
          </text>
          {figure.rows.map((row, index) => (
            <path
              key={row[0]}
              d={`M88 ${height / 2} C130 ${height / 2},110 ${index * 88 + 54},156 ${index * 88 + 54}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          ))}
        </>
      ) : (
        <path
          d={`M48 54 L48 ${height - 78}${figure.layout === 'cycle' ? ` C48 ${height - 18},12 ${height - 18},12 ${height - 78} L12 54 C12 18,48 18,48 54` : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}
      {figure.rows.map(([label, detail], index) => {
        const x = figure.layout === 'network' ? 156 : 48;
        const y = index * 88 + 54;
        return (
          <React.Fragment key={label}>
            <circle
              cx={x}
              cy={y}
              r="7"
              fill="hsl(var(--background, 0 0% 100%))"
              stroke="currentColor"
              strokeWidth="3"
            />
            <text x={x + 24} y={y - 3} fill="currentColor" fontSize="20" fontWeight="700">
              {label}
            </text>
            <text x={x + 24} y={y + 25} fill="currentColor" fontSize="17">
              {detail}
            </text>
            {figure.layout === 'parallel' && (
              <line
                x1={x + 24}
                x2="616"
                y1={y + 42}
                y2={y + 42}
                stroke="currentColor"
                opacity="0.2"
              />
            )}
          </React.Fragment>
        );
      })}
    </svg>
  );
}
