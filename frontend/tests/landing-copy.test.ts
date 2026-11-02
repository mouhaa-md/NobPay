import { describe, expect, it } from 'vitest';
import { LANDING_COPY, type LandingCopy } from '@/components/site/landingCopy';
import { SECTORS, STEP_TEMPLATES } from '@/lib/templates';
import { SECTORS_EN, STEP_TITLES_EN } from '@/lib/templatesEn';
import type { Sector } from '@/lib/types';

/** Every string of a copy object, with its path, for the checks below. */
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

describe('the English wording of the corridors', () => {
  it('covers every sector and every template step, and nothing else', () => {
    const sectors = Object.keys(SECTORS) as Sector[];
    expect(Object.keys(SECTORS_EN).sort()).toEqual([...sectors].sort());
    const frTitles = new Set(sectors.flatMap((s) => STEP_TEMPLATES[s].map((t) => t.title)));
    for (const t of frTitles) expect(STEP_TITLES_EN[t], `no English title for « ${t} »`).toBeTruthy();
    for (const t of Object.keys(STEP_TITLES_EN)) expect(frTitles.has(t), `« ${t} » is no longer a template step`).toBe(true);
  });
});

describe('the landing page copy', () => {
  const { fr, en } = LANDING_COPY;
  const shape = (c: LandingCopy) => ({
    stats: c.why.stats.length,
    steps: c.how.steps.length,
    ticks: c.peek.ticks.length,
    rails: c.rails.items.length,
    checks: c.verify.checks.length,
    faq: c.faq.items.length,
  });

  it('has the same structure in both languages', () => {
    expect(shape(en)).toEqual(shape(fr));
    expect(en.rails.items.map((r) => r.icon)).toEqual(fr.rails.items.map((r) => r.icon));
    expect(en.verify.checks.map((k) => !!k.wait)).toEqual(fr.verify.checks.map((k) => !!k.wait));
  });

  it.each(['fr', 'en'] as const)('%s: no empty text', (lang) => {
    for (const [path, text] of strings(LANDING_COPY[lang])) expect(text.trim().length, `${lang}.${path}`).toBeGreaterThan(0);
  });

  it('the English page has no French left over (the name of the other language excepted)', () => {
    const accents = /[àâçéèêëîïôûùüœ]/i;
    for (const [path, text] of strings(en)) {
      if (path === 'nav.switchTo') continue; // "Français"
      expect(accents.test(text), `${path}: ${text}`).toBe(false);
    }
  });

  it('each language links to the other one', () => {
    expect(fr.nav.switchHref).toBe('/lang/en?next=/en');
    expect(en.nav.switchHref).toBe('/lang/fr?next=/');
    expect(fr.htmlLang).toBe('fr');
    expect(en.htmlLang).toBe('en');
  });

  it('says what the custody is, in both languages (nothing is sold as a bank or as regulated)', () => {
    const custody = (c: LandingCopy) => c.faq.items[0].a.toLowerCase();
    expect(custody(fr)).toContain("ni un compte bancaire ni un service financier agréé");
    expect(custody(en)).toContain('neither a bank account nor a licensed financial service');
    for (const lang of ['fr', 'en'] as const) {
      const all = strings(LANDING_COPY[lang]).map(([, t]) => t.toLowerCase()).join(' ');
      expect(all, lang).not.toMatch(/instantan|instant payment|100 ?% (secure|sûr)|garanti|guaranteed/);
    }
  });
});
