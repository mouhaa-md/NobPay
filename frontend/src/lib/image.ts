import { DHASH_COLS, DHASH_ROWS, dhash, grayGrid } from './dhash';
import { readExif, type ExifInfo } from './exif';

export const UPLOAD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** What the server accepts (see src/server/files.ts); anything else (HEIC, GIF, SVG...) is refused before the upload. */
export const isUploadableImage = (file: File) => UPLOAD_IMAGE_TYPES.includes(file.type);
export const isUploadableProof = (file: File) => isUploadableImage(file) || file.type === 'application/pdf';

/**
 * Shrinks a phone photo before upload: slow mobile connections are the norm on the ground,
 * and a 6 MB picture is useless for a proof that only has to be legible.
 * Returns the original file when it is not an image or when anything goes wrong.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_200_000 && isUploadableImage(file)) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || (blob.size >= file.size && isUploadableImage(file))) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/**
 * What the original photo says about itself, read BEFORE it is shrunk (shrinking drops it): the Exif date and position, and
 * a perceptual fingerprint of the picture. Anything that fails gives less, never an error: a proof is never refused for it.
 */
export async function photoFingerprint(file: File): Promise<{ exif: ExifInfo; dhash?: string }> {
  let exif: ExifInfo = {};
  try {
    if (file.type === 'image/jpeg') exif = readExif(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    /* unreadable: no Exif */
  }
  let hash: string | undefined;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const canvas = document.createElement('canvas');
    canvas.width = DHASH_COLS * 8;
    canvas.height = DHASH_ROWS * 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      hash = dhash(grayGrid(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
    }
    bitmap.close();
  } catch {
    /* an image the browser cannot decode: no fingerprint */
  }
  return { exif, dhash: hash };
}
