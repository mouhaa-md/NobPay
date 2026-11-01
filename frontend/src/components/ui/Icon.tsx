import type { CSSProperties } from 'react';
import { ICONS } from './icons.generated';

/**
 * Material Symbols glyph drawn as an inline SVG (no icon font to download). `filled` picks the filled variant.
 * The icon is 1em wide and tall, so `size` (px), Tailwind `text-*` classes and the landing page rules that set a
 * `font-size` on `.material-symbols-outlined` keep working as they did with the font.
 * Add an icon: use its Material Symbols name, then run `node scripts/build-icons.mjs`.
 */
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
  const glyph = ICONS[name];
  const css = { ...(size ? { fontSize: size } : {}), ...style };
  if (!glyph) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[Icon] icône inconnue « ${name} » : lancez scripts/build-icons.mjs`);
    return <span aria-hidden="true" className={`material-symbols-outlined ${className}`} style={css} />;
  }
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 -960 960 960" fill="currentColor" className={`material-symbols-outlined ${className}`} style={css}>
      <path d={filled && glyph[1] ? glyph[1] : glyph[0]} />
    </svg>
  );
}
