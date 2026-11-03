/**
 * A perceptual fingerprint of a photo (difference hash, 64 bits): two files of the same picture, shrunk differently,
 * recompressed, slightly cropped or re-saved, give almost the same 16 hexadecimal characters, while a plain checksum
 * (SHA-256) changes completely. It is what finds "the same photo again" when the file itself is not the same.
 *
 * The phone computes it from the picture it is about to send; it is, like the position, what the phone says.
 */

export const DHASH_COLS = 9;
export const DHASH_ROWS = 8;

/** `gray`: DHASH_COLS x DHASH_ROWS brightness values, row by row. */
export function dhash(gray: ArrayLike<number>): string {
  if (gray.length !== DHASH_COLS * DHASH_ROWS) throw new Error(`dhash waits for ${DHASH_COLS * DHASH_ROWS} values`);
  let bits = '';
  for (let y = 0; y < DHASH_ROWS; y++) {
    for (let x = 0; x < DHASH_COLS - 1; x++) bits += gray[y * DHASH_COLS + x] > gray[y * DHASH_COLS + x + 1] ? '1' : '0';
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/**
 * Brightness of every cell of a 9 x 8 grid, from the RGBA pixels of an image drawn at 72 x 64 (each cell is the average of
 * an 8 x 8 block: averaging first is what keeps the hash steady when the browser shrinks a large photo roughly).
 */
export function grayGrid(rgba: ArrayLike<number>, width = DHASH_COLS * 8, height = DHASH_ROWS * 8): number[] {
  const cw = width / DHASH_COLS;
  const ch = height / DHASH_ROWS;
  const out: number[] = [];
  for (let gy = 0; gy < DHASH_ROWS; gy++) {
    for (let gx = 0; gx < DHASH_COLS; gx++) {
      let sum = 0;
      for (let y = gy * ch; y < (gy + 1) * ch; y++) {
        for (let x = gx * cw; x < (gx + 1) * cw; x++) {
          const i = (y * width + x) * 4;
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        }
      }
      out.push(sum / (cw * ch));
    }
  }
  return out;
}

export const isDhash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
/** Number of bits that differ between two hashes (0 = the same picture, 64 = nothing in common). */
export function hamming(a: string, b: string): number {
  if (!isDhash(a) || !isDhash(b)) return 64;
  let n = 0;
  for (let i = 0; i < 16; i++) n += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return n;
}
