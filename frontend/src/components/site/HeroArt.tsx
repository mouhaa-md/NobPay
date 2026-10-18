import type { CSSProperties } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Coin, PALETTES, SymbolBitcoin, SymbolDollar, SymbolHouse, SymbolSprout } from './Coin';

/**
 * Hero illustration: four coins standing on a flowing ribbon.
 * One shared box (aspect 1440:520) so the coins and the ribbon always line up; the box is positioned and
 * scaled by CSS (wider than the screen on phones). Coins are HTML wrappers so the motion kit can float and
 * parallax them.
 */

const W = 1440;
const H = 520;
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

interface Place {
  cx: number; // centre in the 1440 x 520 box
  cy: number;
  diameter: number; // visual diameter of the coin face
  parallax: number;
  float: 'a' | 'b';
}

const wrap = (p: Place): CSSProperties => {
  const size = p.diameter * 1.4; // the svg viewBox is 1.4x the face diameter
  return { left: pct(p.cx - size / 2, W), top: pct(p.cy - size / 2, H), width: pct(size, W) };
};

const PLACES: Record<'dollar' | 'bitcoin' | 'sprout' | 'house', Place> = {
  dollar: { cx: 452, cy: 338, diameter: 176, parallax: -20, float: 'a' },
  bitcoin: { cx: 706, cy: 244, diameter: 256, parallax: -40, float: 'b' },
  sprout: { cx: 940, cy: 196, diameter: 164, parallax: -10, float: 'a' },
  house: { cx: 1128, cy: 168, diameter: 180, parallax: -60, float: 'b' },
};

function Chip({ x, y, size, tone, icon, badge, float = 'a', parallax = 0 }: { x: number; y: number; size: number; tone: 'blue' | 'white' | 'teal'; icon: string; badge?: string; float?: 'a' | 'b'; parallax?: number }) {
  const style: CSSProperties = { left: pct(x - size / 2, W), top: pct(y - size / 2, H), width: pct(size, W) };
  return (
    <div className="hero-chip-wrap" style={style} data-nm-parallax={parallax || undefined}>
      <div className={`hero-chip hero-chip--${tone}`} data-nm-float={float}>
        <Icon name={icon} filled={tone !== 'white'} />
        {badge && <b>{badge}</b>}
      </div>
    </div>
  );
}

export function HeroArt() {
  return (
    <div className="hero-art">
      {/* ribbon and landscape, drawn in the same 1440 x 520 box and allowed to run past it */}
      <svg className="hero-ribbon" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="rb-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8db0ff" />
            <stop offset="0.22" stopColor="#bfd2ff" />
            <stop offset="0.55" stopColor="#e9f0ff" />
            <stop offset="1" stopColor="#f8f9ff" />
          </linearGradient>
          <linearGradient id="rb-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#f8f9ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="rb-lip" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4d7dff" stopOpacity="0" />
            <stop offset="0.18" stopColor="#6c93ff" />
            <stop offset="0.5" stopColor="#dce7ff" />
            <stop offset="0.8" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.6" />
          </linearGradient>
          <pattern id="rb-hatch" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
            <rect width="26" height="26" fill="none" />
            <rect width="26" height="1.2" fill="#fff" opacity="0.7" />
          </pattern>
          <clipPath id="rb-clip">
            <path d="M -900 236 C -500 326 -120 396 250 414 C 520 428 708 374 884 308 C 1022 256 1150 214 1284 230 C 1424 246 1610 330 2340 440 L 2340 900 L -900 900 Z" />
          </clipPath>
          <filter id="rb-glow" x="-5%" y="-40%" width="110%" height="180%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <radialGradient id="rb-halo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="760" cy="190" rx="520" ry="230" fill="url(#rb-halo)" />

        {/* back wave with soft hatching */}
        <path d="M -900 236 C -500 326 -120 396 250 414 C 520 428 708 374 884 308 C 1022 256 1150 214 1284 230 C 1424 246 1610 330 2340 440 L 2340 900 L -900 900 Z" fill="url(#rb-body)" />
        <g clipPath="url(#rb-clip)">
          <rect x="-900" y="180" width="3300" height="720" fill="url(#rb-hatch)" opacity="0.55" />
          <path d="M -900 300 C -420 360 -80 450 300 462 C 580 472 760 420 930 356 C 1060 308 1170 280 1290 296 C 1430 314 1620 396 2340 500 L 2340 900 L -900 900 Z" fill="url(#rb-front)" />
        </g>

        {/* ribbon edge: lip, highlight, glow */}
        <path d="M -900 236 C -500 326 -120 396 250 414 C 520 428 708 374 884 308 C 1022 256 1150 214 1284 230 C 1424 246 1610 330 2340 440" fill="none" stroke="#4d7dff" strokeOpacity="0.55" strokeWidth="18" filter="url(#rb-glow)" />
        <path d="M -900 236 C -500 326 -120 396 250 414 C 520 428 708 374 884 308 C 1022 256 1150 214 1284 230 C 1424 246 1610 330 2340 440" fill="none" stroke="url(#rb-lip)" strokeWidth="9" strokeLinecap="round" />
        <path d="M -900 252 C -500 342 -120 412 250 430 C 520 444 708 390 884 324 C 1022 272 1150 230 1284 246 C 1424 262 1610 346 2340 456" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" />

        {/* motion streaks and sparkles */}
        <g stroke="#fff" strokeLinecap="round" opacity="0.75">
          <path d="M 560 150 L 660 92" strokeWidth="2" opacity="0.5" />
          <path d="M 585 168 L 640 138" strokeWidth="1.5" opacity="0.35" />
          <path d="M 1050 70 L 1130 24" strokeWidth="2" opacity="0.45" />
          <path d="M 250 392 L 330 372" strokeWidth="2" opacity="0.5" />
        </g>
        <g fill="#fff">
          <circle cx="528" cy="116" r="6" opacity="0.9" />
          <circle cx="1018" cy="120" r="5" opacity="0.8" />
          <circle cx="1308" cy="140" r="7" opacity="0.9" />
          <circle cx="188" cy="300" r="4" opacity="0.7" />
          <circle cx="226" cy="300" r="2.5" opacity="0.6" />
          <circle cx="270" cy="298" r="2" opacity="0.5" />
          <circle cx="1004" cy="372" r="6" opacity="0.8" />
          <circle cx="1210" cy="352" r="3" opacity="0.7" />
          <circle cx="380" cy="190" r="3" opacity="0.6" />
        </g>
      </svg>

      <div className="hero-coin" style={wrap(PLACES.dollar)} data-nm-parallax={PLACES.dollar.parallax}>
        <div data-nm-float={PLACES.dollar.float}>
          <Coin id="c-dollar" palette={PALETTES.navy} squash={0.7} tilt={-10} edge="left" thickness={22}>
            {SymbolDollar}
          </Coin>
        </div>
      </div>
      <div className="hero-coin" style={wrap(PLACES.bitcoin)} data-nm-parallax={PLACES.bitcoin.parallax}>
        <div data-nm-float={PLACES.bitcoin.float}>
          <Coin id="c-btc" palette={PALETTES.azure} squash={0.78} tilt={7} edge="left" thickness={26}>
            {SymbolBitcoin}
          </Coin>
        </div>
      </div>
      <div className="hero-coin" style={wrap(PLACES.sprout)} data-nm-parallax={PLACES.sprout.parallax}>
        <div data-nm-float={PLACES.sprout.float}>
          <Coin id="c-sprout" palette={PALETTES.teal} squash={0.72} tilt={13} edge="right" thickness={22}>
            {SymbolSprout}
          </Coin>
        </div>
      </div>
      <div className="hero-coin" style={wrap(PLACES.house)} data-nm-parallax={PLACES.house.parallax}>
        <div data-nm-float={PLACES.house.float}>
          <Coin id="c-house" palette={PALETTES.pearl} squash={0.7} tilt={-9} edge="right" thickness={24}>
            {SymbolHouse}
          </Coin>
        </div>
      </div>

      <Chip x={286} y={364} size={62} tone="blue" icon="storefront" badge="3" float="b" parallax={-30} />
      <Chip x={1330} y={262} size={52} tone="white" icon="bolt" float="a" />
      <Chip x={196} y={420} size={50} tone="white" icon="verified" float="b" />
    </div>
  );
}
