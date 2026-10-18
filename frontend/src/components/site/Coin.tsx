import type { ReactNode } from 'react';

/**
 * A 3D-looking coin drawn in SVG: milled edge with thickness, bevelled rim, recessed face, soft gloss.
 * Everything is original vector art; the symbol is drawn by the caller in a 100-unit space (radius 100).
 */

export interface CoinPalette {
  rimHi: string;
  rimLo: string;
  faceHi: string;
  faceLo: string;
  edgeHi: string;
  edgeLo: string;
  groove: string;
  glyph: string;
}

export const PALETTES: Record<'azure' | 'navy' | 'teal' | 'pearl', CoinPalette> = {
  azure: { rimHi: '#f2f6ff', rimLo: '#6f93ff', faceHi: '#a9c2ff', faceLo: '#4f6df5', edgeHi: '#6b8cff', edgeLo: '#1c2fa6', groove: '#2a3fc4', glyph: '#ffffff' },
  navy: { rimHi: '#e6edff', rimLo: '#5b78f0', faceHi: '#4a6cf0', faceLo: '#16258f', edgeHi: '#3050d8', edgeLo: '#0a1260', groove: '#0d1a7a', glyph: '#ffffff' },
  teal: { rimHi: '#e8fff6', rimLo: '#3fbf9d', faceHi: '#5fd9b4', faceLo: '#0f7f78', edgeHi: '#2aa98a', edgeLo: '#0a5560', groove: '#0a6a68', glyph: '#ffffff' },
  pearl: { rimHi: '#ffffff', rimLo: '#a6b9ff', faceHi: '#ffffff', faceLo: '#c9d6ff', edgeHi: '#9db2ff', edgeLo: '#3c55bd', groove: '#8aa0f0', glyph: '#2f4fe0' },
};

interface CoinProps {
  /** unique per coin on the page (gradient ids) */
  id: string;
  palette: CoinPalette;
  /** how much the face is turned away: 1 = facing us, 0.55 = strongly turned */
  squash?: number;
  /** rotation of the whole coin, degrees */
  tilt?: number;
  /** which side the milled edge shows on */
  edge?: 'left' | 'right';
  /** thickness of the coin, in the 100-unit radius space */
  thickness?: number;
  /** the symbol, drawn around (0,0) in a 100-unit radius space, using currentColor */
  children: ReactNode;
  className?: string;
  shadow?: boolean;
}

const R = 100;

export function Coin({ id, palette: p, squash = 0.74, tilt = 0, edge = 'left', thickness = 20, children, className, shadow = true }: CoinProps) {
  const d = edge === 'right' ? 1 : -1;
  const rx = R * squash;
  const t = thickness;
  const shift = (-d * t) / 2; // keep the coin visually centred
  const gx = `${id}-g`;
  return (
    <svg viewBox="-140 -140 280 280" className={className} aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${gx}-rim`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={p.rimHi} />
          <stop offset="1" stopColor={p.rimLo} />
        </linearGradient>
        <radialGradient id={`${gx}-face`} cx="0.32" cy="0.26" r="0.95">
          <stop offset="0" stopColor={p.faceHi} />
          <stop offset="1" stopColor={p.faceLo} />
        </radialGradient>
        <linearGradient id={`${gx}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.edgeHi} />
          <stop offset="1" stopColor={p.edgeLo} />
        </linearGradient>
        <linearGradient id={`${gx}-gloss`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`${gx}-mill`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="2.2" fill="#fff" opacity="0.16" />
          <rect y="3.4" width="6" height="2" fill="#000" opacity="0.14" />
        </pattern>
        <clipPath id={`${gx}-clip`}>
          <ellipse cx="0" cy="0" rx={rx * 0.86} ry={R * 0.86} />
        </clipPath>
        <filter id={`${gx}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <g id={`${gx}-sym`}>{children}</g>
      </defs>

      {shadow && <ellipse cx={0} cy={R * 1.08} rx={rx * 0.9 + t} ry="13" fill="#0a1a6e" opacity="0.32" filter={`url(#${gx}-blur)`} />}

      <g transform={`rotate(${tilt}) translate(${shift} 0)`}>
        {/* thickness: back face, band between the two faces, milled lines */}
        <ellipse cx={d * t} cy="0" rx={rx} ry={R} fill={`url(#${gx}-edge)`} />
        <rect x={Math.min(0, d * t)} y={-R} width={t} height={2 * R} fill={`url(#${gx}-edge)`} />
        <rect x={Math.min(0, d * t)} y={-R} width={t} height={2 * R} fill={`url(#${gx}-mill)`} />
        <ellipse cx={d * t} cy="0" rx={rx} ry={R} fill={`url(#${gx}-mill)`} opacity="0.7" />

        {/* front face: bevelled rim, recessed field */}
        <ellipse cx="0" cy="0" rx={rx} ry={R} fill={`url(#${gx}-rim)`} />
        <ellipse cx="0" cy="0" rx={rx * 0.9} ry={R * 0.9} fill={p.groove} opacity="0.55" />
        <ellipse cx="1.4" cy="2" rx={rx * 0.86} ry={R * 0.86} fill={p.rimLo} opacity="0.5" />
        <ellipse cx="0" cy="0" rx={rx * 0.86} ry={R * 0.86} fill={`url(#${gx}-face)`} />
        <ellipse cx="0" cy="0" rx={rx * 0.7} ry={R * 0.7} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="2.4" />

        {/* symbol: squashed with the face, with a soft emboss */}
        <g transform={`scale(${squash} 1)`}>
          <use href={`#${gx}-sym`} transform="translate(3.5 5)" style={{ color: p.groove }} opacity="0.45" />
          <use href={`#${gx}-sym`} style={{ color: p.glyph }} />
        </g>

        {/* gloss */}
        <g clipPath={`url(#${gx}-clip)`}>
          <path d={`M ${-rx} ${-R * 0.1} C ${-rx * 0.4} ${-R * 1.05} ${rx * 0.7} ${-R * 0.9} ${rx} ${-R * 0.5} L ${rx} ${-R} L ${-rx} ${-R} Z`} fill={`url(#${gx}-gloss)`} />
        </g>
      </g>
    </svg>
  );
}

/* ---- Symbols (100-unit space, drawn with currentColor) ---- */

export const SymbolDollar = (
  <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round">
    <path d="M -58 -34 A 66 66 0 0 0 -58 34" opacity="0.9" />
    <path d="M 58 -34 A 66 66 0 0 1 58 34" opacity="0.9" />
    <text x="0" y="4" textAnchor="middle" dominantBaseline="central" fontFamily="'Bricolage Grotesque Variable', 'Figtree Variable', sans-serif" fontWeight="700" fontSize="104" fill="currentColor" stroke="none">
      $
    </text>
  </g>
);

export const SymbolBitcoin = (
  <g transform="rotate(9)" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
    <path d="M -22 -46 V 46" />
    <path d="M -22 -46 H 12 C 34 -46 42 -33 42 -23 C 42 -11 33 -2 14 -2 H -22" />
    <path d="M -22 -2 H 18 C 40 -2 50 9 50 24 C 50 40 38 46 16 46 H -22" />
    <path d="M -8 -64 V -46 M 12 -64 V -46 M -8 46 V 64 M 12 46 V 64" />
  </g>
);

export const SymbolSprout = (
  <g fill="currentColor" stroke="currentColor" strokeLinejoin="round">
    <path d="M 0 56 V 0" strokeWidth="10" strokeLinecap="round" fill="none" />
    <path d="M 0 26 C -40 28 -54 -2 -52 -32 C -20 -32 2 -12 0 26 Z" strokeWidth="3" />
    <path d="M 0 4 C 0 -34 24 -56 58 -56 C 60 -20 38 4 0 4 Z" strokeWidth="3" />
  </g>
);

export const SymbolHouse = (
  <g fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
    <path d="M -52 -4 L 0 -50 L 52 -4" />
    <path d="M -34 -8 V 46 H -9 V 14 H 9 V 46 H 34 V -8" />
  </g>
);

export const SymbolBag = (
  <g fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round">
    <path d="M -40 -22 H 40 L 46 46 H -46 Z" />
    <path d="M -20 -22 V -34 C -20 -52 20 -52 20 -34 V -22" />
  </g>
);
