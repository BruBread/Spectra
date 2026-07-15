'use client';

import { useId, useState } from 'react';
import type { ActivityPoint } from '../../lib/mock/activity';
import styles from './ActivityChart.module.css';

interface ActivityChartProps {
  data: ActivityPoint[];
}

const WIDTH = 600;
const HEIGHT = 200;
const PADDING_X = 12;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;

export function ActivityChart({ data }: ActivityChartProps) {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const max = Math.max(...data.map((point) => point.value), 10);
  const plotWidth = WIDTH - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const points = data.map((point, index) => {
    const x = PADDING_X + (plotWidth / (data.length - 1)) * index;
    const y = PADDING_TOP + plotHeight - (point.value / max) * plotHeight;
    return { ...point, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PADDING_TOP + plotHeight} L ${points[0].x} ${PADDING_TOP + plotHeight} Z`;

  return (
    <div className={styles.wrapper}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.svg}
        role="img"
        aria-label="Weekly activity trend"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={PADDING_X}
            x2={WIDTH - PADDING_X}
            y1={PADDING_TOP + plotHeight * fraction}
            y2={PADDING_TOP + plotHeight * fraction}
            className={styles.gridLine}
          />
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" className={styles.line} />

        {points.map((point, index) => (
          <g key={point.label}>
            <circle
              cx={point.x}
              cy={point.y}
              r={activeIndex === index ? 5 : 3.5}
              className={styles.point}
            />
            <rect
              x={point.x - plotWidth / data.length / 2}
              y={0}
              width={plotWidth / data.length}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            />
            <text x={point.x} y={HEIGHT - 8} textAnchor="middle" className={styles.axisLabel}>
              {point.label}
            </text>
          </g>
        ))}

        {activeIndex !== null ? (
          <g>
            <line
              x1={points[activeIndex].x}
              x2={points[activeIndex].x}
              y1={PADDING_TOP}
              y2={PADDING_TOP + plotHeight}
              className={styles.hoverLine}
            />
            <foreignObject x={Math.min(Math.max(points[activeIndex].x - 34, 0), WIDTH - 68)} y={Math.max(points[activeIndex].y - 38, 0)} width="68" height="28">
              <div className={styles.tooltip}>{points[activeIndex].value} events</div>
            </foreignObject>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
