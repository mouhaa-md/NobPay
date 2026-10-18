import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StoredFile } from '@/lib/types';
import { getConfig } from './config';
import { sha256Hex } from './crypto';
import { HttpError } from './http';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf']);

const uploadDir = (projectId: string) => path.join(getConfig().dataDir, 'uploads', projectId.replace(/[^a-zA-Z0-9_-]/g, ''));

export async function saveUpload(projectId: string, bytes: Buffer, name: string, mime: string): Promise<StoredFile> {
  if (bytes.length === 0) throw new HttpError(400, 'Fichier vide');
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'Fichier trop lourd (8 Mo maximum)');
  if (!ALLOWED.has(mime)) throw new HttpError(415, 'Format non accepté (photo JPEG, PNG, WebP ou PDF)');
  const sha256 = sha256Hex(bytes);
  const id = `fl_${sha256.slice(0, 20)}`;
  const dir = uploadDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  return { id, name: name.slice(0, 120), mime, size: bytes.length, sha256 };
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
