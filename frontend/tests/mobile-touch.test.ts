import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Phone review of 14 Nov 2026: what was measured on 18 pages at 320, 360 and 390 px must not come back by accident.
const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

describe('phone ergonomics', () => {
  it('no text smaller than 12 px, neither in the design tokens nor in a class name', () => {
    const tokens = [...read('tailwind.config.ts').matchAll(/'label-(?:sm|md|lg)':\s*\['(\d+(?:\.\d+)?)px'/g)];
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    for (const m of tokens) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(12);

    const tiny: string[] = [];
    for (const file of sources(path.join(ROOT, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        if (Number(m[1]) < 12) tiny.push(`${path.relative(ROOT, file)}: ${m[0]}`);
      }
    }
    expect(tiny).toEqual([]);
  });

  it('the stylesheet keeps the touch rules: larger hit areas, 16 px fields, balanced headings', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/@media \(pointer: coarse\)/);
    expect(css).toMatch(/\.tap-area::after/);
    expect(css).toMatch(/\.tap-row\s*\{[^}]*min-height:\s*40px/);
    expect(css).toMatch(/textarea,\s*select\s*\{\s*font-size:\s*16px/); // an iPhone zooms the page on a smaller field
    expect(css).toMatch(/text-wrap:\s*balance/);
  });

  it('full-height pages follow the visible height of the phone (address bar), below lg only', () => {
    const css = read('src/app/globals.css');
    expect(css).toMatch(/@supports \(min-height: 100dvh\)\s*\{\s*@media \(max-width: 1023\.98px\)\s*\{[^}]*\.min-h-screen\s*\{\s*min-height:\s*100dvh/);
    expect(css).toMatch(/\.max-h-\\\[92vh\\\]\s*\{\s*max-height:\s*92dvh/); // the foot of the payment and refund dialogs
  });

  it('the landing links get a larger hit area on a touch screen', () => {
    const css = read('src/app/(site)/site.css');
    expect(css).toMatch(/@media \(pointer: coarse\)[\s\S]*\.site-nav a:not\(\.pill\)::after/);
  });

  it('the viewport uses the whole screen and still lets people zoom', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toMatch(/viewportFit:\s*'cover'/);
    expect(layout).not.toMatch(/maximumScale|userScalable/);
  });
});
