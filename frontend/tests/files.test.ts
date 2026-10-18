import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanFileName, sniffMime } from '@/server/files';

let files: typeof import('@/server/files');
beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-files-'));
  files = await import('@/server/files');
});

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 2)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(20, 3)]);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0x90)]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const html = Buffer.from('<html><script>alert(1)</script></html>');

describe('file type comes from the bytes', () => {
  it.each([
    ['jpeg', jpeg, 'image/jpeg'],
    ['png', png, 'image/png'],
    ['webp', webp, 'image/webp'],
    ['pdf', pdf, 'application/pdf'],
  ])('recognises %s', (_n, bytes, mime) => {
    expect(sniffMime(bytes)?.mime).toBe(mime);
  });

  it.each([['an executable', exe], ['an SVG with a script', svg], ['an HTML page', html], ['empty-ish junk', Buffer.from('hello')]])('does not recognise %s', (_n, bytes) => {
    expect(sniffMime(bytes)).toBeNull();
  });

  it('refuses an .exe renamed to .jpg even when the client announces image/jpeg (415)', async () => {
    await expect(files.saveUpload('p_x', exe, 'photo.jpg', 'image/jpeg')).rejects.toMatchObject({ status: 415, code: 'bad_format' });
  });

  it('refuses SVG and HTML uploads, whatever they claim to be', async () => {
    await expect(files.saveUpload('p_x', svg, 'logo.svg', 'image/svg+xml')).rejects.toMatchObject({ status: 415 });
    await expect(files.saveUpload('p_x', html, 'x.png', 'image/png')).rejects.toMatchObject({ status: 415 });
  });

  it('stores a real photo under the type its bytes show, ignoring the announced one, with a clean name', async () => {
    const f = await files.saveUpload('p_x', png, '../../etc/passwd.jpg', 'image/jpeg');
    expect(f.mime).toBe('image/png');
    expect(f.name).toBe('passwd.png');
    expect(f.size).toBe(png.length);
  });

  it('refuses empty and oversized files', async () => {
    await expect(files.saveUpload('p_x', Buffer.alloc(0), 'a.jpg')).rejects.toMatchObject({ status: 400 });
    await expect(files.saveUpload('p_x', Buffer.concat([jpeg, Buffer.alloc(files.MAX_UPLOAD_BYTES)]), 'a.jpg')).rejects.toMatchObject({ status: 413 });
  });
});

describe('display names', () => {
  it('drops paths, control characters and risky punctuation, and forces the real extension', () => {
    expect(cleanFileName('C:\\Users\\moi\\facture 12.PDF', 'pdf')).toBe('facture 12.pdf');
    expect(cleanFileName('a"b<c>.jpg\n', 'jpg')).toBe('abc.jpg');
    expect(cleanFileName('', 'png')).toBe('fichier.png');
    expect(cleanFileName('x'.repeat(300) + '.jpg', 'jpg').length).toBeLessThanOrEqual(84);
  });
});
