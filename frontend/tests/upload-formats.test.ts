import { describe, expect, it } from 'vitest';
import { isUploadableImage, isUploadableProof } from '@/lib/image';

const file = (type: string) => new File(['x'], 'f', { type });

describe('formats the field form lets through (they must match what the server accepts)', () => {
  it('accepts JPEG, PNG and WebP photos', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) expect(isUploadableImage(file(t))).toBe(true);
  });
  it('refuses HEIC, GIF and SVG photos before the upload', () => {
    for (const t of ['image/heic', 'image/heif', 'image/gif', 'image/svg+xml', 'application/pdf', '']) expect(isUploadableImage(file(t))).toBe(false);
  });
  it('accepts a PDF only where an invoice is expected', () => {
    expect(isUploadableProof(file('application/pdf'))).toBe(true);
    expect(isUploadableProof(file('image/svg+xml'))).toBe(false);
    expect(isUploadableProof(file('text/html'))).toBe(false);
  });
});
