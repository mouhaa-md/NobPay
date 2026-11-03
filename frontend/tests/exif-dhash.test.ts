import { describe, expect, it } from 'vitest';
import { DHASH_COLS, DHASH_ROWS, dhash, grayGrid, hamming, isDhash } from '@/lib/dhash';
import { distanceKm, readExif } from '@/lib/exif';

/** A JPEG that is only its Exif block: what a phone writes, built by hand so the reader can be tried on exact bytes. */
function jpegWithExif(opts: { date?: string; zone?: string; lat?: { d: number; m: number; s: number; ref: string }; lon?: { d: number; m: number; s: number; ref: string }; big?: boolean }): ArrayBuffer {
  const little = !opts.big;
  const buf = new ArrayBuffer(400);
  const v = new DataView(buf);
  let tiffAt = 0;
  const u16 = (o: number, n: number) => v.setUint16(tiffAt + o, n, little);
  const u32 = (o: number, n: number) => v.setUint32(tiffAt + o, n, little);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(tiffAt + o + i, c.charCodeAt(0)));
  const entry = (o: number, tag: number, type: number, count: number, value: number) => {
    u16(o, tag);
    u16(o + 2, type);
    u32(o + 4, count);
    u32(o + 8, value);
  };

  // JPEG: SOI, APP1 "Exif\0\0", then the TIFF block
  v.setUint16(0, 0xffd8);
  v.setUint16(2, 0xffe1);
  v.setUint16(4, 360);
  [...'Exif'].forEach((c, i) => v.setUint8(6 + i, c.charCodeAt(0)));
  tiffAt = 12;
  text(0, little ? 'II' : 'MM');
  u16(2, 42);
  u32(4, 8);
  // IFD0 at 8: Exif IFD pointer, GPS IFD pointer
  u16(8, 2);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 68);
  // Exif IFD at 38: DateTimeOriginal (data at 122), OffsetTimeOriginal (data at 142)
  u16(38, opts.zone ? 2 : 1);
  entry(40, 0x9003, 2, 20, 122);
  if (opts.zone) entry(52, 0x9011, 2, 7, 142);
  // GPS IFD at 68: refs inline, coordinates at 150 and 174
  u16(68, 4);
  v.setUint8(tiffAt + 70 + 8, (opts.lat?.ref ?? 'N').charCodeAt(0));
  u16(70, 0x0001);
  u16(72, 2);
  u32(74, 2);
  entry(82, 0x0002, 5, 3, 150);
  v.setUint8(tiffAt + 94 + 8, (opts.lon?.ref ?? 'E').charCodeAt(0));
  u16(94, 0x0003);
  u16(96, 2);
  u32(98, 2);
  entry(106, 0x0004, 5, 3, 174);
  if (opts.date) text(122, `${opts.date}\0`);
  if (opts.zone) text(142, `${opts.zone}\0`);
  const rat = (o: number, c: { d: number; m: number; s: number }) => {
    u32(o, c.d); u32(o + 4, 1); u32(o + 8, c.m); u32(o + 12, 1); u32(o + 16, Math.round(c.s * 100)); u32(o + 20, 100);
  };
  if (opts.lat) rat(150, opts.lat);
  if (opts.lon) rat(174, opts.lon);
  return buf;
}

describe('reading the Exif block of a photo', () => {
  it('reads the moment of the shot (with its zone) and the position', () => {
    const info = readExif(jpegWithExif({ date: '2026:11:02 18:30:15', zone: '+01:00', lat: { d: 14, m: 47, s: 6.96, ref: 'N' }, lon: { d: 16, m: 55, s: 34.32, ref: 'W' } }));
    expect(info.takenAt).toBe('2026-11-02T17:30:15.000Z'); // 18:30 at +01:00
    expect(info.gps?.lat).toBeCloseTo(14.78527, 5);
    expect(info.gps?.lng).toBeCloseTo(-16.92620, 4); // west is negative
  });

  it('is the same in big-endian files, and the south is negative too', () => {
    const info = readExif(jpegWithExif({ big: true, date: '2025:01:03 08:00:00', zone: '+00:00', lat: { d: 33, m: 30, s: 0, ref: 'S' }, lon: { d: 151, m: 12, s: 0, ref: 'E' } }));
    expect(info.takenAt).toBe('2025-01-03T08:00:00.000Z');
    expect(info.gps).toEqual({ lat: -33.5, lng: 151.2 });
  });

  it('without a written zone, the time is the time of this machine (the phone\'s own)', () => {
    const info = readExif(jpegWithExif({ date: '2026:11:02 18:30:15' }));
    expect(info.takenAt).toBe(new Date(2026, 10, 2, 18, 30, 15).toISOString());
    expect(info.gps).toBeUndefined();
  });

  it('gives nothing for what is not a usable block: not a JPEG, no Exif, cut short, impossible values', () => {
    expect(readExif(new ArrayBuffer(0))).toEqual({});
    expect(readExif(new TextEncoder().encode('GIF89a not a jpeg at all').buffer as ArrayBuffer)).toEqual({});
    const noExif = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 1, 2, 3]).buffer;
    expect(readExif(noExif)).toEqual({});
    const good = jpegWithExif({ date: '2026:11:02 18:30:15', zone: '+00:00', lat: { d: 14, m: 0, s: 0, ref: 'N' }, lon: { d: 16, m: 0, s: 0, ref: 'W' } });
    for (const cut of [5, 11, 30, 60, 130, 160]) expect(() => readExif(good.slice(0, cut))).not.toThrow();
    expect(readExif(jpegWithExif({ date: '2026:13:45 99:99:99', zone: '+00:00' })).takenAt).toBeUndefined(); // month 13
    expect(readExif(jpegWithExif({ date: '1970:01:01 00:00:00', zone: '+00:00' })).takenAt).toBeUndefined(); // a clock that never had a date
    expect(readExif(jpegWithExif({ lat: { d: 0, m: 0, s: 0, ref: 'N' }, lon: { d: 0, m: 0, s: 0, ref: 'E' } })).gps).toBeUndefined(); // (0, 0) is "no fix"
    expect(readExif(jpegWithExif({ lat: { d: 95, m: 0, s: 0, ref: 'N' }, lon: { d: 10, m: 0, s: 0, ref: 'E' } })).gps).toBeUndefined();
  });

  it('survives random bytes (a hostile file must not be able to crash the form)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff);
    for (let n = 0; n < 200; n++) {
      const bytes = new Uint8Array(300).map(rnd);
      bytes[0] = 0xff;
      bytes[1] = 0xd8;
      bytes[2] = 0xff;
      bytes[3] = 0xe1;
      expect(() => readExif(bytes.buffer)).not.toThrow();
    }
  });
});

describe('distance between two positions', () => {
  it('is in kilometres', () => {
    expect(distanceKm({ lat: 14.79, lng: -16.93 }, { lat: 14.79, lng: -16.93 })).toBe(0);
    expect(distanceKm({ lat: 14.6937, lng: -17.4441 }, { lat: 14.79, lng: -16.93 })).toBeGreaterThan(50); // Dakar to Thiès
    expect(distanceKm({ lat: 14.6937, lng: -17.4441 }, { lat: 14.79, lng: -16.93 })).toBeLessThan(60);
    expect(distanceKm({ lat: 14.79, lng: -16.93 }, { lat: 48.85, lng: 2.35 })).toBeGreaterThan(4_000); // Thiès to Paris
  });
});

describe('the perceptual fingerprint of a photo', () => {
  const cells = DHASH_COLS * DHASH_ROWS;
  /** a "scene": smooth shapes plus a bit of texture, as an array of brightness values for a 72 x 64 picture */
  const scene = (seed: number, brightness = 1, noise = 0) => {
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const fx = 2 + (seed % 5);
    const fy = 3 + (seed % 3);
    const rgba = new Uint8ClampedArray(72 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 72; x++) {
        const v = 128 + 90 * Math.sin((x / 72) * Math.PI * fx + seed) * Math.cos((y / 64) * Math.PI * fy) + (noise ? (rnd() - 0.5) * noise : 0);
        const i = (y * 72 + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = Math.max(0, Math.min(255, v * brightness));
        rgba[i + 3] = 255;
      }
    }
    return rgba;
  };
  const hashOf = (rgba: Uint8ClampedArray) => dhash(grayGrid(rgba));

  it('has the shape of a hash: 16 hexadecimal characters, from a 9 x 8 grid', () => {
    const flat = new Array(cells).fill(100);
    expect(dhash(flat)).toBe('0000000000000000');
    const ramp = Array.from({ length: cells }, (_, i) => 255 - (i % DHASH_COLS) * 20); // brighter on the left: every comparison is 1
    expect(dhash(ramp)).toBe('ffffffffffffffff');
    expect(isDhash(dhash(ramp))).toBe(true);
    expect(isDhash('xyz')).toBe(false);
    expect(isDhash('FFFFFFFFFFFFFFFF')).toBe(false);
    expect(() => dhash([1, 2, 3])).toThrow();
  });

  it('counts the bits that differ', () => {
    expect(hamming('0000000000000000', '0000000000000000')).toBe(0);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming('0000000000000001', '0000000000000000')).toBe(1);
    expect(hamming('f0f0f0f0f0f0f0f0', '0f0f0f0f0f0f0f0f')).toBe(64);
    expect(hamming('not a hash', '0000000000000000')).toBe(64); // anything unusable is "nothing in common"
  });

  it('the same picture made brighter, re-saved with noise or slightly different stays close; another picture does not', () => {
    const base = hashOf(scene(3));
    expect(hamming(base, hashOf(scene(3)))).toBe(0);
    expect(hamming(base, hashOf(scene(3, 1.25)))).toBeLessThanOrEqual(2); // brightness
    expect(hamming(base, hashOf(scene(3, 0.8)))).toBeLessThanOrEqual(2);
    expect(hamming(base, hashOf(scene(3, 1, 12)))).toBeLessThanOrEqual(6); // recompression noise
    for (const other of [1, 2, 4, 5, 6, 7, 8]) expect(hamming(base, hashOf(scene(other))), `scene ${other}`).toBeGreaterThan(8);
  });
});
