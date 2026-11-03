import { describe, expect, it } from 'vitest';
import { translatorFor } from '@/lib/i18n/messages';
import { formatDate, formatDateTime, formatEur, formatFcfa, formatInt, formatRate, formatSats, formatUsd, formatUsdShort, relativeDay, usdToEur, usesEuro, XOF_PER_EUR } from '@/lib/money';

const NBSP = ' ';

describe('amounts follow the language of the reader', () => {
  it('French is what it always was (and what a call without a language gives)', () => {
    expect(formatUsd(5_689_330)).toBe(`56${NBSP}893,30${NBSP}$`);
    expect(formatUsdShort(2_400_000)).toBe(`24${NBSP}000${NBSP}$`);
    expect(formatUsdShort(2_400_050)).toBe(`24${NBSP}000,50${NBSP}$`);
    expect(formatFcfa(1_520_000)).toBe(`1${NBSP}520${NBSP}000${NBSP}FCFA`);
    expect(formatSats(2_500)).toBe(`2${NBSP}500${NBSP}sats`);
    expect(formatInt(1_520_000)).toBe(`1${NBSP}520${NBSP}000`);
    expect(formatRate(612.5)).toBe('612,5');
    expect(formatEur(23_144)).toBe(`23${NBSP}144${NBSP}€`);
    expect(formatUsd(5_689_330, 'fr')).toBe(formatUsd(5_689_330));
  });

  it('English: dollar sign first, commas and points', () => {
    expect(formatUsd(5_689_330, 'en')).toBe('$56,893.30');
    expect(formatUsdShort(2_400_000, 'en')).toBe('$24,000');
    expect(formatUsdShort(2_400_050, 'en')).toBe('$24,000.50');
    expect(formatFcfa(1_520_000, 'en')).toBe(`1,520,000${NBSP}FCFA`);
    expect(formatSats(2_500, 'en')).toBe(`2,500${NBSP}sats`);
    expect(formatInt(1_520_000, 'en')).toBe('1,520,000');
    expect(formatRate(612.5, 'en')).toBe('612.5');
    expect(formatEur(23_144, 'en')).toBe('€23,144');
  });

  it('the translator of a component carries its language, so the same call is enough', () => {
    const en = translatorFor('en');
    const fr = translatorFor('fr');
    expect(en.lang).toBe('en');
    expect(formatUsd(150_000, en)).toBe('$1,500.00');
    expect(formatUsd(150_000, fr)).toBe(`1${NBSP}500,00${NBSP}$`);
    expect(formatUsdShort(100, undefined)).toBe(`1${NBSP}$`);
    expect(formatUsdShort(100, null)).toBe(`1${NBSP}$`);
    expect(formatUsdShort(100, { lang: undefined })).toBe(`1${NBSP}$`); // a translator type that does not say: French
  });

  it('never leaves a narrow no-break space (the fonts have no glyph for it)', () => {
    for (const l of ['fr', 'en'] as const) for (const s of [formatUsd(123_456_789, l), formatFcfa(98_765_432, l), formatInt(1_234_567, l)]) expect(s).not.toMatch(/ /);
  });
});

describe('dates follow the language of the reader', () => {
  const noon = '2026-11-02T12:00:00Z';
  it('a long date', () => {
    expect(formatDate(noon)).toMatch(/2 novembre 2026/);
    expect(formatDate(noon, 'en')).toMatch(/November 2, 2026/);
  });

  it('a short date with the time', () => {
    expect(formatDateTime(noon)).toMatch(/^2 nov/);
    expect(formatDateTime(noon, 'en')).toMatch(/^Nov 2, /);
  });

  it('"today" and "yesterday" say the time the way the reader reads it', () => {
    const now = new Date(2026, 10, 2, 20, 0); // local time, so the test does not depend on the machine's zone
    const at = new Date(2026, 10, 2, 19, 5).toISOString();
    expect(relativeDay(at, translatorFor('fr'), now)).toMatch(/^Aujourd'hui, 19:05$/);
    expect(relativeDay(at, translatorFor('en'), now)).toMatch(/^Today, 0?7:05\sPM$/);
    expect(relativeDay(new Date(2026, 10, 1, 18, 30).toISOString(), translatorFor('en'), now)).toMatch(/^Yesterday, 0?6:30\sPM$/);
    expect(relativeDay(new Date(2026, 9, 20, 9, 0).toISOString(), translatorFor('en'), now)).toMatch(/October 20, 2026/);
  });
});

describe('euros, from the peg of the CFA franc (no second source of prices)', () => {
  it('1 EUR is 655.957 FCFA by treaty, so dollars become euros through the dollar\'s rate in FCFA', () => {
    expect(XOF_PER_EUR).toBe(655.957);
    expect(usdToEur(100_000, 593)).toBeCloseTo((1_000 * 593) / 655.957, 6); // $1,000 at 593 FCFA per dollar
    expect(Math.round(usdToEur(100_000, 593))).toBe(904);
    expect(usdToEur(0, 593)).toBe(0);
  });

  it('only residents of the euro area are shown euros', () => {
    for (const c of ['FR', 'be', 'DE', 'IT', 'ES', 'PT', 'NL', 'IE', 'LU', 'AT', 'FI', 'GR']) expect(usesEuro(c), c).toBe(true);
    for (const c of ['SN', 'US', 'CA', 'GB', 'CH', '', undefined]) expect(usesEuro(c), String(c)).toBe(false);
  });
});
