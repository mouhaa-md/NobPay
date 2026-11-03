/**
 * What a phone writes inside a photo, read from the original file before the browser shrinks it (shrinking drops it):
 * the moment it was taken, and where. A small, defensive reader of the Exif block of a JPEG: whatever is odd or cut short
 * gives "nothing", never an error and never a guess.
 *
 * It is still what the phone SAYS: a person who edits the file can write anything. It makes a re-sent old photo visible
 * (its file date is new, its Exif date is not); it does not make a photo true.
 */

export interface ExifInfo {
  /** ISO date of the shot (DateTimeOriginal) */
  takenAt?: string;
  gps?: { lat: number; lng: number };
}

const MAX_SCAN = 256 * 1024;

/** `buffer` is the beginning of the file (the Exif block sits in the first 64 KB; 256 KB is plenty). */
export function readExif(buffer: ArrayBuffer): ExifInfo {
  try {
    return parse(new DataView(buffer, 0, Math.min(buffer.byteLength, MAX_SCAN)));
  } catch {
    return {};
  }
}

function parse(view: DataView): ExifInfo {
  if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return {}; // not a JPEG
  let pos = 2;
  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) return {};
    const marker = view.getUint8(pos + 1);
    if (marker === 0xda || marker === 0xd9) return {}; // start of the picture data: no Exif before it
    const size = view.getUint16(pos + 2);
    if (size < 2) return {};
    if (marker === 0xe1 && pos + 10 <= view.byteLength && view.getUint32(pos + 4) === 0x45786966 && view.getUint16(pos + 8) === 0) {
      return fromTiff(view, pos + 10, Math.min(view.byteLength, pos + 2 + size));
    }
    pos += 2 + size;
  }
  return {};
}

interface Entry {
  type: number;
  count: number;
  /** offset of the value inside the TIFF block */
  at: number;
}

function fromTiff(view: DataView, base: number, end: number): ExifInfo {
  if (base + 8 > end) return {};
  const order = view.getUint16(base);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return {};
  const u16 = (o: number) => view.getUint16(base + o, little);
  const u32 = (o: number) => view.getUint32(base + o, little);
  const inside = (o: number, n: number) => o >= 0 && base + o + n <= end;
  if (u16(2) !== 42) return {};

  const ifd = (offset: number): Map<number, Entry> => {
    const out = new Map<number, Entry>();
    if (!inside(offset, 2)) return out;
    const n = Math.min(u16(offset), 200);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (!inside(e, 12)) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 } as Record<number, number>)[type] ?? 0;
      if (!size || count > 1_000) continue;
      out.set(u16(e), { type, count, at: size * count <= 4 ? e + 8 : u32(e + 8) });
    }
    return out;
  };
  const ascii = (e?: Entry): string | undefined => {
    if (!e || e.type !== 2 || !inside(e.at, e.count)) return undefined;
    let s = '';
    for (let i = 0; i < e.count; i++) {
      const c = view.getUint8(base + e.at + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (e: Entry | undefined, n: number): number[] | undefined => {
    if (!e || e.type !== 5 || e.count < n || !inside(e.at, n * 8)) return undefined;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const den = u32(e.at + i * 8 + 4);
      if (den === 0) return undefined;
      out.push(u32(e.at + i * 8) / den);
    }
    return out;
  };
  const pointer = (e?: Entry) => (e && (e.type === 4 || e.type === 3) && e.count === 1 ? (e.type === 4 ? u32(e.at) : u16(e.at)) : undefined);

  const root = ifd(u32(4));
  const exif = ifd(pointer(root.get(0x8769)) ?? -1);
  const gpsIfd = ifd(pointer(root.get(0x8825)) ?? -1);

  const info: ExifInfo = {};

  const when = ascii(exif.get(0x9003)) ?? ascii(root.get(0x0132));
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(when ?? '');
  if (m) {
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    const zone = /^([+-])(\d{2}):(\d{2})$/.exec(ascii(exif.get(0x9011)) ?? '');
    const date = zone
      ? new Date(Date.UTC(y, mo - 1, d, h, mi, s) - (zone[1] === '-' ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3])) * 60_000)
      : new Date(y, mo - 1, d, h, mi, s); // no zone written: the zone of the phone, which is the zone of this browser
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && !Number.isNaN(date.getTime()) && y >= 2000) info.takenAt = date.toISOString();
  }

  const lat = rationals(gpsIfd.get(0x0002), 3);
  const lng = rationals(gpsIfd.get(0x0004), 3);
  const latRef = ascii(gpsIfd.get(0x0001));
  const lngRef = ascii(gpsIfd.get(0x0003));
  if (lat && lng && (latRef === 'N' || latRef === 'S') && (lngRef === 'E' || lngRef === 'W')) {
    const deg = (r: number[]) => r[0] + r[1] / 60 + r[2] / 3600;
    const la = (latRef === 'S' ? -1 : 1) * deg(lat);
    const lo = (lngRef === 'W' ? -1 : 1) * deg(lng);
    // (0, 0) is what a camera without a fix writes; out of range is a corrupted block
    if (Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0)) info.gps = { lat: Math.round(la * 1e5) / 1e5, lng: Math.round(lo * 1e5) / 1e5 };
  }
  return info;
}

/** Distance in kilometres between two points (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
