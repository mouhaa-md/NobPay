import { describe, expect, it } from 'vitest';
import { photoMetaSchema, validate } from '@/server/validation';

describe('what the phone says about each photo', () => {
  const ok = (m: object) => validate(photoMetaSchema, [m]);
  const bad = (m: object) => expect(() => validate(photoMetaSchema, [m])).toThrow();

  it('accepts the date and the position read inside the photo, and its fingerprint', () => {
    const m = ok({ takenAt: '2026-11-02T10:00:00.000Z', lat: 14.79, lng: -16.93, exifTakenAt: '2026-11-02T09:55:00.000Z', exifLat: 14.78, exifLng: -16.92, dhash: '00ff00ff00ff00ff' });
    expect(m[0]).toMatchObject({ exifLat: 14.78, dhash: '00ff00ff00ff00ff' });
    expect(ok({})).toEqual([{}]); // an old form, or a photo that says nothing
  });

  it('refuses what cannot be true', () => {
    bad({ exifTakenAt: 'yesterday-ish' });
    bad({ exifTakenAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }); // a shot in the future
    bad({ exifLat: 95 });
    bad({ exifLng: -200 });
    bad({ dhash: 'XYZ' });
    bad({ dhash: 'FFFFFFFFFFFFFFFF' }); // upper case: not what the phone writes
    bad({ dhash: '00ff' });
    bad({ somethingElse: 1 }); // known fields only
  });
});
