interface SpectraLogoProps {
  size?: number;
  className?: string;
}

const BAND_RADII = [42, 33, 24, 15, 6];
const STROKE_WIDTH = 7;
const CENTER_X = 50;
const BASELINE = 54;

/**
 * Concentric rainbow-arc mark. Rendered standalone (no background chip) —
 * it's meant to sit directly on whatever surface it's placed on.
 */
export function SpectraLogo({ size = 24, className }: SpectraLogoProps) {
  return (
    <svg
      width={size}
      height={size * 0.6}
      viewBox="0 0 100 60"
      className={className}
      role="img"
      aria-label="Spectra"
    >
      {BAND_RADII.map((radius) => (
        <path
          key={radius}
          d={`M ${CENTER_X - radius} ${BASELINE} A ${radius} ${radius} 0 0 1 ${CENTER_X + radius} ${BASELINE}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
