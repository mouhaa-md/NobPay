import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StoredFile } from '@/lib/types';
import { getConfig } from './config';
import { sha256Hex } from './crypto';
import { HttpError } from './http';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * What the BYTES say the file is. The type announced by the client is never trusted.
 * SVG is deliberately absent: an uploaded SVG can carry scripts (demo images shipped in /public use `publicPath`
 * and do not go through here).
 */
export function sniffMime(bytes: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number, ...v: number[]) => v.every((b, k) => bytes[i + k] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png' };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: 'image/webp', ext: 'webp' }; // RIFF....WEBP
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: 'application/pdf', ext: 'pdf' }; // %PDF-
  return null;
}

/** A display name that is safe to show and to put in a header: no path, no control characters, right extension. */
export function cleanFileName(name: string, ext: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const stem = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim().replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 80);
  return `${stem || 'fichier'}.${ext}`;
}

const uploadDir = (projectId: string) => path.join(getConfig().dataDir, 'uploads', projectId.replace(/[^a-zA-Z0-9_-]/g, ''));

export async function saveUpload(projectId: string, bytes: Buffer, name: string, _declaredMime?: string): Promise<StoredFile> {
  if (bytes.length === 0) throw new HttpError(400, 'Fichier vide');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Fichier trop lourd (8 Mo maximum)', 'too_large');
  const kind = sniffMime(bytes);
  if (!kind) throw new HttpError(415, 'Format non accepté (photo JPEG, PNG, WebP ou PDF)', 'bad_format');
  const sha256 = sha256Hex(bytes);
  const id = `fl_${sha256.slice(0, 20)}`;
  const dir = uploadDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  return { id, name: cleanFileName(name, kind.ext), mime: kind.mime, size: bytes.length, sha256 };
}

export async function readUpload(projectId: string, file: StoredFile): Promise<Buffer | null> {
  try {
    if (file.publicPath) {
      return await fs.readFile(path.join(process.cwd(), 'public', file.publicPath));
    }
    return await fs.readFile(path.join(uploadDir(projectId), file.id.replace(/[^a-zA-Z0-9_-]/g, '')));
  } catch {
    return null;
  }
}
