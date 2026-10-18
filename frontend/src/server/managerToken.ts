import type { Db, Project, User } from '@/lib/types';
import { getConfig } from './config';
import { hmacHex, safeEqual } from './crypto';
import { withDb } from './db';
import { HttpError } from './http';
import { assertSessionSecret } from './secret';

/**
 * The private link of the person on site (`/terrain/<token>`), no account needed.
 *
 * A token is `<projectId>.<version>.<expiresAt>.<hmac>`: signed with the server secret, so nothing reusable sits in
 * the database file, the funder can always see the link again, and it expires (90 days). Renewing raises the project's
 * `managerTokenVersion`, which kills every older link at once.
 *
 * Legacy tokens (plaintext field on the project) still work so existing links do not break; demo projects' public
 * tokens (`demo-villa-thies`...) only work while ALLOW_DEMO permits.
 */

export const MANAGER_TOKEN_DAYS = 90;

const mac = (projectId: string, version: number, exp: number) =>
  hmacHex('sha256', assertSessionSecret(), `manager:${projectId}:${version}:${exp}`).slice(0, 32);

export function issueManagerToken(projectId: string, version: number, now = Date.now()): { token: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + MANAGER_TOKEN_DAYS * 86400;
  return { token: `${projectId}.${version}.${exp}.${mac(projectId, version, exp)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Does `token` open `project`? */
export function managerTokenMatches(project: Project, token: string, now = Date.now()): boolean {
  if (!token) return false;
  if (project.managerToken && safeEqual(token, project.managerToken)) {
    return !project.demo || getConfig().allowDemo; // legacy plaintext token
  }
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== project.id || project.managerTokenVersion === undefined) return false;
  const version = Number(parts[1]);
  const exp = Number(parts[2]);
  if (!Number.isInteger(version) || !Number.isInteger(exp) || version !== project.managerTokenVersion) return false;
  if (exp * 1000 <= now) return false;
  return safeEqual(parts[3], mac(project.id, version, exp));
}

export function findProjectByManagerToken(db: Pick<Db, 'projects'>, token: string, now = Date.now()): Project | undefined {
  const parts = token.split('.');
  if (parts.length === 4) return db.projects.find((p) => p.id === parts[0] && managerTokenMatches(p, token, now));
  return db.projects.find((p) => p.managerToken && managerTokenMatches(p, token, now));
}

/** The token to show the owner in the link (derived from what is stored, or the legacy plaintext one). */
export function managerLinkToken(project: Project): string {
  if (project.managerToken) return project.managerToken;
  const exp = Math.floor(Date.parse(project.managerTokenExpiresAt ?? '') / 1000);
  if (!Number.isFinite(exp) || project.managerTokenVersion === undefined) return '';
  return `${project.id}.${project.managerTokenVersion}.${exp}.${mac(project.id, project.managerTokenVersion, exp)}`;
}

export function managerTokenState(project: Project, now = Date.now()): { expired: boolean; expiresAt?: string; legacy: boolean } {
  if (project.managerToken) return { expired: false, legacy: true };
  const expired = !project.managerTokenExpiresAt || Date.parse(project.managerTokenExpiresAt) <= now;
  return { expired, expiresAt: project.managerTokenExpiresAt, legacy: false };
}

/** Owner renews the link: every older link stops working, the new one lasts 90 more days. */
export async function rotateManagerToken(owner: User, projectId: string): Promise<{ token: string; expiresAt: string }> {
  return withDb((db) => {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project || project.ownerId !== owner.id) throw new HttpError(404, 'Projet introuvable');
    const version = (project.managerTokenVersion ?? 0) + 1;
    const issued = issueManagerToken(project.id, version);
    project.managerToken = undefined; // a legacy plaintext link dies with the rotation
    project.managerTokenVersion = version;
    project.managerTokenExpiresAt = issued.expiresAt;
    return issued;
  });
}
