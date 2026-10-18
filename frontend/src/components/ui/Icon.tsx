import type { CSSProperties } from 'react';

/** Material Symbols glyph. `filled` switches the FILL axis (as in the Stitch screens). */
export function Icon({
  name,
  className = '',
  filled = false,
  size,
  style,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      style={{ fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400`, ...(size ? { fontSize: size } : {}), ...style }}
    >
      {name}
    </span>
  );
}
