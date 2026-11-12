import { afterEach, describe, expect, it, vi } from 'vitest';
import { reserveUpload, uploadBudgetBytes, uploadsInFlight } from '@/server/uploadBudget';

const MB = 1024 * 1024;
afterEach(() => vi.unstubAllEnvs());

describe('upload memory budget', () => {
  it('counts the uploads being handled and gives their share back, once', () => {
    const a = reserveUpload(10 * MB);
    const b = reserveUpload(20 * MB);
    expect(uploadsInFlight()).toBe(30 * MB);
    a();
    a(); // a second release of the same upload must not give back more than it took
    expect(uploadsInFlight()).toBe(20 * MB);
    b();
    expect(uploadsInFlight()).toBe(0);
  });

  it('turns away what would go over the budget with a 503 and a wait, and takes nothing for it', () => {
    const first = reserveUpload(30 * MB);
    expect(() => reserveUpload(20 * MB)).toThrow(expect.objectContaining({ status: 503, code: 'busy', retryAfter: 5 }));
    expect(uploadsInFlight()).toBe(30 * MB);
    const second = reserveUpload(18 * MB); // exactly the rest of the 48 MB
    expect(uploadsInFlight()).toBe(48 * MB);
    second();
    first();
    expect(uploadsInFlight()).toBe(0);
  });

  it('always accepts one upload, however big, so a small budget can never block everything', () => {
    vi.stubEnv('UPLOAD_MEMORY_MB', '1');
    const only = reserveUpload(60 * MB);
    expect(() => reserveUpload(1)).toThrow(expect.objectContaining({ status: 503 }));
    only();
    expect(() => reserveUpload(60 * MB)()).not.toThrow();
  });

  it('UPLOAD_MEMORY_MB sets the budget; a missing or senseless value means 48 MB', () => {
    expect(uploadBudgetBytes()).toBe(48 * MB);
    vi.stubEnv('UPLOAD_MEMORY_MB', '160');
    expect(uploadBudgetBytes()).toBe(160 * MB);
    for (const bad of ['', 'abc', '0', '-5']) {
      vi.stubEnv('UPLOAD_MEMORY_MB', bad);
      expect(uploadBudgetBytes()).toBe(48 * MB);
    }
  });
});
